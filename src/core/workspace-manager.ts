/**
 * WorkspacePool - 工作空间池管理器
 *
 * 实现工作空间复用模式：
 * - 预创建固定数量的工作空间（对应 batchSize）
 * - 每个任务复用空闲槽位，只更新 test 和 target
 * - 任务完成后只清空 test/target，保留 src/pom/.m2
 * - 整个队列结束后删除所有池子
 */

import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"

export interface WorkspacePoolConfig {
  /** 项目根目录 */
  projectRoot: string
  /** 工作空间池根目录 */
  workspaceRoot: string
  /** 池子大小（对应 batchSize） */
  poolSize: number
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
  /** 源码软链接路径 */
  srcLink: string
  /** POM 文件软链接路径 */
  pomLink: string
  /** Maven 本地仓库路径 */
  m2Path: string
  /** 编译输出目录 */
  targetPath: string
  /** 测试源码目录 */
  testPath: string
}

/**
 * WorkspacePool 类
 *
 * 管理工作空间池，实现槽位复用
 */
export class WorkspacePool {
  private config: WorkspacePoolConfig
  private slots: Map<number, WorkspaceSlot>
  private availableSlots: number[]
  private isInitialized: boolean

  constructor(config: WorkspacePoolConfig) {
    this.config = {
      ...config,
      workspaceRoot: config.workspaceRoot || path.join(config.projectRoot, ".dtagent", "workspace-pool"),
      poolSize: config.poolSize || 4,
    }
    this.slots = new Map()
    this.availableSlots = []
    this.isInitialized = false
  }

  /**
   * 初始化工作空间池
   *
   * 创建固定数量的工作空间槽位，每个槽位包含：
   * - src 软链接
   * - pom.xml 软链接
   * - .m2 目录
   *
   * @returns boolean 是否成功
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true
    }

    // console.log(`[WorkspacePool] 初始化工作空间池，大小: ${this.config.poolSize}`)

    try {
      // 确保工作空间池根目录存在
      if (!fs.existsSync(this.config.workspaceRoot)) {
        fs.mkdirSync(this.config.workspaceRoot, { recursive: true })
      }

      // 创建每个槽位
      for (let i = 0; i < this.config.poolSize; i++) {
        const slot = await this.createSlot(i)
        if (!slot) {
          console.error(`[WorkspacePool] 创建槽位 ${i} 失败`)
          return false
        }
        this.slots.set(i, slot)
        this.availableSlots.push(i)
        // console.log(`[WorkspacePool] 槽位 ${i} 已创建: ${slot.path}`)
      }

      this.isInitialized = true
      // console.log(`[WorkspacePool] 初始化完成，共 ${this.config.poolSize} 个槽位`)
      return true
    } catch (error) {
      console.error(`[WorkspacePool] 初始化失败:`, error)
      return false
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
      console.error(`[WorkspacePool] 池子未初始化`)
      return null
    }

    if (this.availableSlots.length === 0) {
      console.error(`[WorkspacePool] 没有空闲槽位`)
      return null
    }

    const slotIndex = this.availableSlots.shift()!
    const slot = this.slots.get(slotIndex)!

    // 标记为占用
    slot.isOccupied = true
    slot.currentTaskId = taskId

    // 清空 test 和 target 目录（如果存在）
    this.resetSlot(slot)

    // console.log(`[WorkspacePool] 槽位 ${slotIndex} 分配给任务 ${taskId}`)
    return slot
  }

  /**
   * 释放槽位（任务完成）
   *
   * 不清除整个目录，只清空 test 和 target，保留 src/pom/.m2
   *
   * @param slotIndex 槽位索引
   */
  releaseSlot(slotIndex: number): void {
    const slot = this.slots.get(slotIndex)
    if (!slot) {
      console.error(`[WorkspacePool] 槽位 ${slotIndex} 不存在`)
      return
    }

    // 清空 test 和 target 目录
    this.resetSlot(slot)

    // 标记为空闲
    slot.isOccupied = false
    slot.currentTaskId = undefined
    this.availableSlots.push(slotIndex)

    // console.log(`[WorkspacePool] 槽位 ${slotIndex} 已释放`)
  }

  /**
   * 销毁整个池子
   *
   * 删除所有槽位目录
   * 注意：先删除软链接，避免误删原项目
   */
  destroy(): void {
    for (const [index, slot] of this.slots) {
      try {
        // 1. 先删除软链接（安全：只删除链接，不删除目标）
        this.removeSymlink(slot.srcLink, "dir")
        this.removeSymlink(slot.pomLink, "file")
        
        // 2. 删除独立的 .m2 和 target 目录
        if (fs.existsSync(slot.m2Path)) {
          fs.rmSync(slot.m2Path, { recursive: true, force: true })
        }
        if (fs.existsSync(slot.targetPath)) {
          fs.rmSync(slot.targetPath, { recursive: true, force: true })
        }
        
        // 3. 最后尝试删除槽位目录本身（此时应该是空的或只有已删除的软链接残留）
        if (fs.existsSync(slot.path)) {
          try {
            fs.rmdirSync(slot.path)  // 用 rmdir 而不是 rmSync，更安全
          } catch (e) {
            // 如果目录非空，强制删除（此时软链接已删除，安全）
            fs.rmSync(slot.path, { recursive: true, force: true })
          }
        }
      } catch (error) {
        console.error(`[WorkspacePool] 删除槽位 ${index} 失败:`, error)
      }
    }

    // 清空池子根目录
    try {
      if (fs.existsSync(this.config.workspaceRoot)) {
        fs.rmSync(this.config.workspaceRoot, { recursive: true, force: true })
      }
    } catch (error) {
      console.error(`[WorkspacePool] 删除池子根目录失败:`, error)
    }

    this.slots.clear()
    this.availableSlots = []
    this.isInitialized = false
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
        console.error(`[WorkspacePool] 无法删除软链接: ${linkPath}`, e)
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

      // 2. 软链接 src 目录
      const srcTarget = path.join(this.config.projectRoot, "src")
      const srcLink = path.join(slotPath, "src")
      if (!fs.existsSync(srcLink)) {
        const success = this.createSymlink(srcTarget, srcLink, "dir")
        if (!success) {
          console.error(`[WorkspacePool] 槽位 ${index}: 创建 src 软链接失败`)
          return null
        }
      }

      // 3. 软链接 pom.xml
      const pomTarget = path.join(this.config.projectRoot, "pom.xml")
      const pomLink = path.join(slotPath, "pom.xml")
      if (!fs.existsSync(pomLink)) {
        const success = this.createSymlink(pomTarget, pomLink, "file")
        if (!success) {
          console.error(`[WorkspacePool] 槽位 ${index}: 创建 pom.xml 软链接失败`)
          return null
        }
      }

      // 4. 创建独立 .m2 目录
      const m2Path = path.join(slotPath, ".m2")
      if (!fs.existsSync(m2Path)) {
        fs.mkdirSync(m2Path, { recursive: true })
      }

      // 5. 创建空的 target 目录（后续会被清空）
      const targetPath = path.join(slotPath, "target")
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }

      // 6. 创建空的 src/test 目录（后续会被清空）
      const testPath = path.join(slotPath, "src", "test")
      if (!fs.existsSync(testPath)) {
        fs.mkdirSync(testPath, { recursive: true })
      }

      const slot: WorkspaceSlot = {
        slotIndex: index,
        path: slotPath,
        isOccupied: false,
        srcLink,
        pomLink,
        m2Path,
        targetPath,
        testPath,
      }

      return slot
    } catch (error) {
      console.error(`[WorkspacePool] 创建槽位 ${index} 失败:`, error)
      return null
    }
  }

  /**
   * 重置槽位
   *
   * 只清空 target 目录（编译产物）
   * 注意：不清空 src/test，因为 src 是软链接到原项目，删除会影响原项目
   *
   * @param slot 槽位
   */
  private resetSlot(slot: WorkspaceSlot): void {
    try {
      // 清空 target 目录（编译产物）
      if (fs.existsSync(slot.targetPath)) {
        fs.rmSync(slot.targetPath, { recursive: true, force: true })
        fs.mkdirSync(slot.targetPath, { recursive: true })
      }

      // 注意：不清空 src/test，因为 src 是软链接到原项目
      // 测试文件应该写到原项目的 src/test 目录
    } catch (error) {
      console.error(`[WorkspacePool] 重置槽位 ${slot.slotIndex} 失败:`, error)
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
      console.error(`[WorkspacePool] 创建软链接失败: ${linkPath} -> ${target}`, error)
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
      console.error(`[WorkspacePool] 槽位 ${slotIndex} 不存在`)
      return false
    }

    const sourceDir = path.join(slot.path, "src", "test", "java")
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

      console.log(`[WorkspacePool] 测试文件已复制: ${sourceDir} -> ${targetDir}`)
      return true
    } catch (error) {
      console.error(`[WorkspacePool] 复制测试文件失败:`, error)
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
