/**
 * WorkspacePool - 工作空间池管理器
 *
 * 实现工作空间复用模式：
 * - 预创建固定数量的工作空间（对应 batchSize）
 * - 每个任务复用空闲槽位，只更新 test 和 target
 * - 任务完成后只清空 test/target，保留 main/pom/.m2
 * - 整个队列结束后删除所有池子
 * 
 * 关键设计：
 * - src/main 软链接到原项目（共享业务代码）
 * - src/test 独立目录（隔离测试文件）
 */

import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"

export interface WorkspacePoolConfig {
  /** 项目根目录 */
  projectRoot: string
  /** 工作空间池根目录 */
  workspaceRoot?: string
  /** 池子大小（对应 batchSize） */
  poolSize?: number
  /** 日志文件路径 */
  logPath?: string
}

export interface WorkspaceSlot {
  /** 槽位索引 */
  slotIndex: number
  /** 工作目录路径 */
  path: string
  /** 是否被占用 */
  isOccupied: boolean
  /** 当前占用此槽位的任务 ID */
  currentTaskId?: string
  /** src/main 软链接路径（共享业务代码） */
  mainLink: string
  /** POM 文件软链接路径 */
  pomLink: string
  /** Maven 本地仓库路径 */
  m2Path: string
  /** 编译输出目录 */
  targetPath: string
  /** 测试源码目录（独立） */
  testPath: string
}

/**
 * WorkspacePool 类
 *
 * 管理工作空间池，实现槽位复用
 */
export class WorkspacePool {
  private config: Required<WorkspacePoolConfig>
  private slots: Map<number, WorkspaceSlot>
  private availableSlots: number[]
  private isInitialized: boolean
  private logStream: fs.WriteStream | null = null

  constructor(config: WorkspacePoolConfig) {
    this.config = {
      projectRoot: config.projectRoot,
      workspaceRoot: config.workspaceRoot || path.join(config.projectRoot, ".dtagent", "workspace-pool"),
      poolSize: config.poolSize || 4,
      logPath: config.logPath || path.join(config.projectRoot, ".dtagent", "log", "dtagent.log"),
    }
    this.slots = new Map()
    this.availableSlots = []
    this.isInitialized = false
    
    // 初始化日志系统
    this.initLogger()
  }

  /**
   * 初始化日志系统
   */
  private initLogger(): void {
    try {
      // 确保日志目录存在
      const logDir = path.dirname(this.config.logPath)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }

      // 创建日志写入流（追加模式）
      this.logStream = fs.createWriteStream(this.config.logPath, { flags: 'a' })
      this.log('info', '日志系统初始化完成')
    } catch (error) {
      // 日志初始化失败，不影响主流程
      console.error(`[WorkspacePool] 日志系统初始化失败:`, error)
    }
  }

  /**
   * 写入日志
   * 
   * @param level 日志级别: 'debug' | 'info' | 'warn' | 'error'
   * @param message 日志消息
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] [${level.toUpperCase()}] [WorkspacePool] ${message}\n`

    // 写入文件
    if (this.logStream) {
      this.logStream.write(logLine)
    }

    // 只在 error 级别时打印到控制台（减少 GUI 干扰）
    if (level === 'error') {
      console.error(`[WorkspacePool] ${message}`)
    }
  }

  /**
   * 销毁日志系统
   */
  private destroyLogger(): void {
    if (this.logStream) {
      this.log('info', '日志系统关闭')
      this.logStream.end()
      this.logStream = null
    }
  }

  /**
   * 初始化工作空间池
   *
   * 创建固定数量的工作空间槽位，每个槽位包含：
   * - src/main 软链接（共享业务代码）
   * - src/test 独立目录（隔离测试文件）
   * - pom.xml 软链接
   * - .m2 目录
   *
   * @returns boolean 是否成功
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true
    }

    this.log('info', `初始化工作空间池，大小: ${this.config.poolSize}`)

    try {
      // 1. 清理旧的槽位（如果存在）
      if (fs.existsSync(this.config.workspaceRoot)) {
        this.log('info', '检测到旧的槽位，正在清理...')
        this.cleanupOldSlots()
      }

      // 2. 确保工作空间池根目录存在
      if (!fs.existsSync(this.config.workspaceRoot)) {
        fs.mkdirSync(this.config.workspaceRoot, { recursive: true })
      }

      // 3. 创建每个槽位
      for (let i = 0; i < this.config.poolSize; i++) {
        const slot = await this.createSlot(i)
        if (!slot) {
          this.log('error', `创建槽位 ${i} 失败`)
          return false
        }
        this.slots.set(i, slot)
        this.availableSlots.push(i)
      }

      this.isInitialized = true
      this.log('info', `工作空间池初始化完成，共 ${this.config.poolSize} 个槽位`)
      return true
    } catch (error) {
      this.log('error', `初始化失败: ${error}`)
      return false
    }
  }

  /**
   * 清理旧的槽位目录
   */
  private cleanupOldSlots(): void {
    try {
      const entries = fs.readdirSync(this.config.workspaceRoot, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('slot-')) {
          const slotPath = path.join(this.config.workspaceRoot, entry.name)
          
          // 1. 先删除软链接（避免误删原项目）
          const mainLink = path.join(slotPath, "src", "main")
          const pomLink = path.join(slotPath, "pom.xml")
          
          this.removeSymlink(mainLink, "dir")
          this.removeSymlink(pomLink, "file")
          
          // 2. 删除整个槽位目录
          fs.rmSync(slotPath, { recursive: true, force: true })
          
          this.log('info', `已清理旧槽位: ${entry.name}`)
        }
      }
    } catch (error) {
      this.log('warn', `清理旧槽位失败: ${error}`)
    }
  }

  /**
   * 获取一个空闲槽位
   *
   * @param taskId 任务 ID
   * @returns WorkspaceSlot | null
   */
  acquireSlot(taskId: string): WorkspaceSlot | null {
    if (!this.isInitialized) {
      this.log('error', '池子未初始化')
      return null
    }

    if (this.availableSlots.length === 0) {
      this.log('error', '没有空闲槽位')
      return null
    }

    const slotIndex = this.availableSlots.shift()!
    const slot = this.slots.get(slotIndex)!

    // 标记为占用
    slot.isOccupied = true
    slot.currentTaskId = taskId

    // 清空 test 和 target 目录（如果存在）
    this.resetSlot(slot)

    this.log('debug', `槽位 ${slotIndex} 分配给任务 ${taskId}`)
    return slot
  }

  /**
   * 释放槽位（任务完成）
   *
   * 不清除整个目录，只清空 test 和 target，保留 main/pom/.m2
   *
   * @param slotIndex 槽位索引
   */
  releaseSlot(slotIndex: number): void {
    const slot = this.slots.get(slotIndex)
    if (!slot) {
      this.log('error', `槽位 ${slotIndex} 不存在`)
      return
    }

    // 清空 test 和 target 目录
    this.resetSlot(slot)

    // 标记为空闲
    slot.isOccupied = false
    slot.currentTaskId = undefined
    this.availableSlots.push(slotIndex)

    this.log('debug', `槽位 ${slotIndex} 已释放`)
  }

  /**
   * 销毁整个池子
   *
   * 删除所有槽位目录
   * 注意：先删除软链接，避免误删原项目
   */
  destroy(): void {
    this.log('info', '销毁工作空间池')

    for (const [index, slot] of this.slots) {
      try {
        // 1. 先删除软链接（安全：只删除链接，不删除目标）
        this.removeSymlink(slot.mainLink, "dir")
        this.removeSymlink(slot.pomLink, "file")
        
        // 2. 删除独立的目录
        if (fs.existsSync(slot.m2Path)) {
          fs.rmSync(slot.m2Path, { recursive: true, force: true })
        }
        if (fs.existsSync(slot.targetPath)) {
          fs.rmSync(slot.targetPath, { recursive: true, force: true })
        }
        if (fs.existsSync(slot.testPath)) {
          fs.rmSync(slot.testPath, { recursive: true, force: true })
        }
        
        // 3. 删除槽位目录
        if (fs.existsSync(slot.path)) {
          // 先删除 src 目录（可能包含 main 软链接和 test 目录）
          const srcPath = path.join(slot.path, "src")
          if (fs.existsSync(srcPath)) {
            // 先删除 main 软链接
            this.removeSymlink(slot.mainLink, "dir")
            // 再删除整个 src 目录
            fs.rmSync(srcPath, { recursive: true, force: true })
          }
          
          // 删除槽位根目录
          fs.rmSync(slot.path, { recursive: true, force: true })
        }
      } catch (error) {
        this.log('error', `删除槽位 ${index} 失败: ${error}`)
      }
    }

    // 清空池子根目录
    try {
      if (fs.existsSync(this.config.workspaceRoot)) {
        fs.rmSync(this.config.workspaceRoot, { recursive: true, force: true })
      }
    } catch (error) {
      this.log('error', `删除池子根目录失败: ${error}`)
    }

    this.slots.clear()
    this.availableSlots = []
    this.isInitialized = false

    // 销毁日志系统
    this.destroyLogger()
  }

  /**
   * 安全删除软链接
   * 
   * @param linkPath 软链接路径
   * @param type 类型: 'file' | 'dir'
   */
  private removeSymlink(linkPath: string, type: "file" | "dir"): void {
    if (!fs.existsSync(linkPath)) return
    
    try {
      if (process.platform === "win32") {
        // Windows: junction 用 rmdir，硬链接用 unlink
        if (type === "dir") {
          fs.rmdirSync(linkPath)
        } else {
          fs.unlinkSync(linkPath)
        }
      } else {
        // Unix: 都是 unlink
        fs.unlinkSync(linkPath)
      }
    } catch (error) {
      // 如果删除失败，尝试强制删除
      try {
        fs.rmSync(linkPath, { force: true })
      } catch (e) {
        this.log('warn', `无法删除软链接: ${linkPath}`)
      }
    }
  }

  /**
   * 获取池子状态
   */
  getStatus(): { total: number; available: number; occupied: number } {
    return {
      total: this.config.poolSize,
      available: this.availableSlots.length,
      occupied: this.config.poolSize - this.availableSlots.length,
    }
  }

  /**
   * 创建槽位
   *
   * 目录结构：
   * slot-{n}/
   * ├── src/
   * │   ├── main → 软链接到项目/src/main（共享业务代码）
   * │   └── test/java/ → 独立目录（隔离测试文件）
   * ├── pom.xml → 软链接
   * ├── .m2/ → 独立 Maven 仓库
   * └── target/ → 独立编译输出
   *
   * @param index 槽位索引
   * @returns WorkspaceSlot | null
   */
  private async createSlot(index: number): Promise<WorkspaceSlot | null> {
    const slotPath = path.join(this.config.workspaceRoot, `slot-${index}`)

    try {
      // 1. 创建槽位目录
      if (!fs.existsSync(slotPath)) {
        fs.mkdirSync(slotPath, { recursive: true })
      }

      // 2. 创建 src 目录（独立目录，不是软链接）
      const srcPath = path.join(slotPath, "src")
      if (!fs.existsSync(srcPath)) {
        fs.mkdirSync(srcPath, { recursive: true })
      }

      // 3. 软链接 src/main 目录（只链接业务代码）
      const mainTarget = path.join(this.config.projectRoot, "src", "main")
      const mainLink = path.join(slotPath, "src", "main")
      if (!fs.existsSync(mainLink)) {
        const success = this.createSymlink(mainTarget, mainLink, "dir")
        if (!success) {
          this.log('error', `槽位 ${index}: 创建 src/main 软链接失败`)
          return null
        }
      }

      // 4. 创建独立的 src/test/java 目录（隔离测试文件）
      const testPath = path.join(slotPath, "src", "test", "java")
      if (!fs.existsSync(testPath)) {
        fs.mkdirSync(testPath, { recursive: true })
      }

      // 5. 软链接 pom.xml
      const pomTarget = path.join(this.config.projectRoot, "pom.xml")
      const pomLink = path.join(slotPath, "pom.xml")
      if (!fs.existsSync(pomLink)) {
        const success = this.createSymlink(pomTarget, pomLink, "file")
        if (!success) {
          this.log('error', `槽位 ${index}: 创建 pom.xml 软链接失败`)
          return null
        }
      }

      // 6. 创建独立 .m2 目录
      const m2Path = path.join(slotPath, ".m2")
      if (!fs.existsSync(m2Path)) {
        fs.mkdirSync(m2Path, { recursive: true })
      }

      // 7. 创建空的 target 目录
      const targetPath = path.join(slotPath, "target")
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }

      const slot: WorkspaceSlot = {
        slotIndex: index,
        path: slotPath,
        isOccupied: false,
        mainLink,
        pomLink,
        m2Path,
        targetPath,
        testPath,
      }

      this.log('debug', `槽位 ${index} 创建成功`)
      return slot
    } catch (error) {
      this.log('error', `创建槽位 ${index} 失败: ${error}`)
      return null
    }
  }

  /**
   * 重置槽位
   *
   * 清空 target 目录（编译产物）和 src/test/java 目录（测试文件）
   * 现在 src/test 是独立目录，可以安全清空
   *
   * @param slot 槽位
   */
  private resetSlot(slot: WorkspaceSlot): void {
    try {
      // 1. 清空 target 目录（编译产物）
      if (fs.existsSync(slot.targetPath)) {
        fs.rmSync(slot.targetPath, { recursive: true, force: true })
        fs.mkdirSync(slot.targetPath, { recursive: true })
      }

      // 2. 清空 src/test/java 目录（测试文件）
      // 现在 src/test 是独立目录，可以安全清空
      if (fs.existsSync(slot.testPath)) {
        fs.rmSync(slot.testPath, { recursive: true, force: true })
        fs.mkdirSync(slot.testPath, { recursive: true })
      }

      this.log('debug', `槽位 ${slot.slotIndex} 已重置`)
    } catch (error) {
      this.log('error', `重置槽位 ${slot.slotIndex} 失败: ${error}`)
    }
  }

  /**
   * 创建软链接
   *
   * @param target 目标路径
   * @param linkPath 链接路径
   * @param type 类型: 'file' | 'dir'
   * @returns boolean
   */
  private createSymlink(target: string, linkPath: string, type: "file" | "dir"): boolean {
    try {
      // 确保父目录存在
      const parentDir = path.dirname(linkPath)
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true })
      }

      // Windows 目录用 junction，文件用硬链接
      // Unix 都用 symlink
      if (process.platform === "win32") {
        if (type === "dir") {
          execSync(`mklink /J "${linkPath}" "${target}"`, { stdio: "ignore" })
        } else {
          execSync(`mklink /H "${linkPath}" "${target}"`, { stdio: "ignore" })
        }
      } else {
        fs.symlinkSync(target, linkPath, type === "dir" ? "dir" : "file")
      }
      return true
    } catch (error) {
      this.log('error', `创建软链接失败: ${linkPath} -> ${target}`)
      return false
    }
  }

  /**
   * 复制槽位中的测试文件到原项目
   *
   * @param slotIndex 槽位索引
   * @param projectRoot 原项目根目录
   * @returns boolean 是否成功
   */
  copyTestFiles(slotIndex: number, projectRoot: string): boolean {
    const slot = this.slots.get(slotIndex)
    if (!slot) {
      this.log('error', `槽位 ${slotIndex} 不存在`)
      return false
    }

    // 源目录：槽位的 src/test/java（独立目录）
    const sourceDir = slot.testPath
    // 目标目录：原项目的 src/test/java
    const targetDir = path.join(projectRoot, "src", "test", "java")

    // 检查源目录是否存在
    if (!fs.existsSync(sourceDir)) {
      // 没有测试文件，不算失败
      return true
    }

    try {
      // 确保目标目录存在
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      // 递归复制目录
      this.copyDirectoryRecursive(sourceDir, targetDir)

      this.log('info', `测试文件已复制: ${sourceDir} -> ${targetDir}`)
      return true
    } catch (error) {
      this.log('error', `复制测试文件失败: ${error}`)
      return false
    }
  }

  /**
   * 递归复制目录
   *
   * @param source 源目录
   * @param target 目标目录
   */
  private copyDirectoryRecursive(source: string, target: string): void {
    // 确保目标目录存在
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true })
    }

    const entries = fs.readdirSync(source, { withFileTypes: true })

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name)
      const targetPath = path.join(target, entry.name)

      if (entry.isDirectory()) {
        // 递归复制子目录
        this.copyDirectoryRecursive(sourcePath, targetPath)
      } else {
        // 复制文件
        fs.copyFileSync(sourcePath, targetPath)
      }
    }
  }
}

// 导出工厂函数
export function createWorkspacePool(projectRoot: string, poolSize: number): WorkspacePool {
  const workspaceRoot = path.join(projectRoot, ".dtagent", "workspace-pool")
  return new WorkspacePool({
    projectRoot,
    workspaceRoot,
    poolSize,
  })
}

export default WorkspacePool