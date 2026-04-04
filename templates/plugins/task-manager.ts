import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"

// 导入 WorkspacePool（工作空间池）
import { WorkspacePool, createWorkspacePool } from "../core/workspace-manager"

// 导入 Maven 配置和解析函数
import {
  loadMavenConfig,
  buildMavenArgs,
  parseTestResult,
  parseCompileResult,
  parseCoverageResult
} from "../core/maven-config"
import { execSync } from "child_process"

/**
 * OpenCode Task Manager Plugin
 * 
 * 支持两种模式：
 * 1. 目录扫描模式：task-create
 * 2. 文件列表模式：task-create-files（MR 场景）
 * 
 * 新增功能：工作空间隔离
 * - 每个任务创建独立工作目录
 * - 支持并行执行无冲突
 * - 自动清理工作目录
 */

interface TaskItem {
  filename: string        // 文件路径
  prompt: string          // 该文件的任务提示词
  metadata?: Record<string, any>  // 额外元数据（如变更类型、变更方法等）
}

interface TaskResult {
  filename: string
  sessionId: string
  status: "pending" | "running" | "success" | "failed"
  summary?: string
  error?: string
}

interface QueueState {
  // 目录扫描模式
  dirPath: string
  files: string[]
  prompt: string
  
  // 文件列表模式
  taskItems: TaskItem[]
  
  // 通用
  currentIndex: number
  results: TaskResult[]
  running: boolean
  currentSessionId?: string
  batchSize: number
  mode: "directory" | "filelist"
  
  // 工作空间池管理
  workspacePool?: WorkspacePool
  taskSlotMap?: Map<number, number> // task index -> slot index
}

// 按项目目录存储队列
const queueMap = new Map<string, QueueState>()

function getQueue(directory: string): QueueState {
  if (!queueMap.has(directory)) {
    queueMap.set(directory, {
      dirPath: "",
      files: [],
      prompt: "",
      taskItems: [],
      currentIndex: 0,
      results: [],
      running: false,
      batchSize: 1,
      mode: "directory",
    })
  }
  return queueMap.get(directory)!
}

export const TaskManagerPlugin: Plugin = async ({ client, directory }) => {
  
  const queue = getQueue(directory)
  
  async function getSessionSummary(sessionId: string): Promise<string> {
    try {
      const messages = await client.session.messages({ path: { id: sessionId } })
      if (!messages.data || messages.data.length === 0) {
        return "无结果"
      }
      const lastMessage = messages.data[messages.data.length - 1]
      const parts = (lastMessage as any).parts || []
      const textParts = parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n")
      return textParts.slice(0, 500) + (textParts.length > 500 ? "..." : "")
    } catch {
      return "获取结果失败"
    }
  }

  // 执行单个任务（支持两种模式，带工作空间池隔离）
  async function executeTask(index: number): Promise<{ success: boolean; summary?: string; error?: string }> {
    let filename: string
    let fullPrompt: string
    let taskId: string
    let testClassName: string  // 对应的测试类名
    
    if (queue.mode === "filelist") {
      // 文件列表模式
      const task = queue.taskItems[index]
      filename = task.filename
      const absolutePath = path.resolve(directory, task.filename)
      taskId = `task-${index}-${path.basename(filename, path.extname(filename))}`
      testClassName = path.basename(filename, path.extname(filename)) + "Test"
      fullPrompt = `【文件路径：${absolutePath}】\n${task.prompt}`
    } else {
      // 目录扫描模式
      filename = queue.files[index]
      const absolutePath = path.resolve(queue.dirPath, filename)
      taskId = `task-${index}-${path.basename(filename, path.extname(filename))}`
      testClassName = path.basename(filename, path.extname(filename)) + "Test"
      const userPrompt = queue.prompt.replace(/{filename}/g, filename)
      fullPrompt = `【文件路径：${absolutePath}】\n\n${userPrompt}`
    }
    
    const baseName = path.basename(filename)
    const title = baseName
    
    // 获取工作空间槽位（如果 batchSize > 1）
    let slotIndex: number | null = null
    let workspacePath: string | null = null
    let m2Path: string | null = null
    
    if (queue.batchSize > 1 && queue.workspacePool) {
      const slot = queue.workspacePool.acquireSlot(taskId)
      if (slot) {
        slotIndex = slot.slotIndex
        workspacePath = slot.path
        m2Path = slot.m2Path
        
        // 记录任务和槽位的映射
        if (!queue.taskSlotMap) {
          queue.taskSlotMap = new Map()
        }
        queue.taskSlotMap.set(index, slotIndex)
        
        // 在 prompt 中注入工作空间信息
        fullPrompt = `[工作空间隔离模式]\n` +
          `当前任务在独立工作目录中执行，避免与其他并行任务冲突。\n` +
          `槽位: ${slotIndex}\n` +
          `工作目录: ${workspacePath}\n` +
          `Maven 仓库: ${m2Path}\n` +
          `测试类名: ${testClassName}\n\n` +
          `【重要】只为此任务生成和运行测试:\n` +
          `- 测试文件名: ${testClassName}.java\n` +
          `- 使用工具: maven-test --target ${testClassName} --level class\n` +
          `- 编译: maven-compile\n` +
          `${fullPrompt}`
      } else {
        // console.error(`[TaskManager] 无法获取工作空间槽位，任务 ${taskId} 将在默认空间执行`)
      }
    }
    
    const session = await client.session.create({
      body: { title }
    })
    if (!session.data) {
      // 释放槽位（如果获取失败）
      if (queue.batchSize > 1 && queue.workspacePool && slotIndex !== null) {
        queue.workspacePool.releaseSlot(slotIndex)
      }
      return { success: false, error: "创建 Session 失败" }
    }
    
    const sessionId = session.data.id
    queue.currentSessionId = sessionId
    
    queue.results.push({
      filename,
      sessionId,
      status: "running",
    })
    
    try {
      await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: fullPrompt }],
        },
      })
      
      const summary = await getSessionSummary(sessionId)
      
      // 任务成功完成后，复制测试文件到原项目（在释放槽位之前）
      if (queue.batchSize > 1 && queue.workspacePool && slotIndex !== null) {
        const copied = queue.workspacePool.copyTestFiles(slotIndex, directory)
        if (!copied) {
          console.error(`[TaskManager] 复制测试文件失败: 槽位 ${slotIndex}`)
        }
      }
      
      // 任务完成后释放槽位（复用，不删除）
      if (queue.batchSize > 1 && queue.workspacePool && slotIndex !== null) {
        queue.workspacePool.releaseSlot(slotIndex)
      }
      
      return { success: true, summary }
    } catch (e) {
      // 任务失败后也释放槽位（不复制测试文件）
      if (queue.batchSize > 1 && queue.workspacePool && slotIndex !== null) {
        queue.workspacePool.releaseSlot(slotIndex)
      }
      return { success: false, error: String(e) }
    }
  }

  async function executeAllTasks(): Promise<void> {
    const totalTasks = queue.mode === "filelist" ? queue.taskItems.length : queue.files.length
    let runningCount = 0  // 当前运行中的任务数
    let nextTaskIndex = 0  // 下一个要执行的任务索引
    
    // 处理单个任务完成后的回调
    async function onTaskComplete(index: number, result: { success: boolean; summary?: string; error?: string }) {
      // 更新结果
      let filename: string
      if (queue.mode === "filelist") {
        filename = queue.taskItems[index].filename
      } else {
        filename = queue.files[index]
      }
      
      const task = queue.results.find(t => t.filename === filename && t.status === "running")
      if (task) {
        task.status = result.success ? "success" : "failed"
        task.summary = result.summary
        task.error = result.error
      }
      
      runningCount--
      queue.currentIndex = Math.max(queue.currentIndex, index + 1)
      
      // 尝试启动下一个任务
      scheduleNext()
    }
    
    // 调度下一个任务
    async function scheduleNext() {
      // 检查是否应该继续
      if (!queue.running) {
        // 队列已停止，检查是否需要清理
        if (runningCount === 0) {
          finishAll()
        }
        return
      }
      
      // 如果还有空闲槽位且还有任务，启动下一个任务
      while (nextTaskIndex < totalTasks && runningCount < queue.batchSize) {
        const taskIndex = nextTaskIndex++
        runningCount++
        
        // 异步执行任务，完成后回调
        executeTask(taskIndex).then(result => {
          onTaskComplete(taskIndex, result)
        })
      }
      
      // 如果所有任务都已启动且都完成了，结束
      if (nextTaskIndex >= totalTasks && runningCount === 0) {
        finishAll()
      }
    }
    
    // 完成所有任务后的清理
    function finishAll() {
      queue.running = false
      queue.currentSessionId = undefined
      
      // 销毁工作空间池
      if (queue.workspacePool) {
        queue.workspacePool.destroy()
        queue.workspacePool = undefined
        queue.taskSlotMap = undefined
      }
    }
    
    // 开始调度
    scheduleNext()
  }

  return {
    tool: {
      // 目录扫描模式
      "task-create": tool({
        description: "创建任务队列（目录扫描模式）",
        args: {
          dir: tool.schema.string().describe("目录路径"),
          ext: tool.schema.string().optional().default("java").describe("文件后缀"),
          recursive: tool.schema.boolean().optional().default(false).describe("递归扫描"),
          prompt: tool.schema.string().describe("任务提示词，{filename} 代表文件名"),
          batchSize: tool.schema.number().optional().default(1).describe("并行数"),
        },
        async execute(args) {
          const dirPath = path.isAbsolute(args.dir) 
            ? args.dir 
            : path.resolve(directory, args.dir)
          
          if (!fs.existsSync(dirPath)) {
            return `❌ 目录不存在: ${dirPath}`
          }

          let ext = args.ext || "java"
          if (!ext.startsWith(".")) ext = "." + ext
          const regex = new RegExp(`\\${ext}$`)

          function scanDirectory(baseDir: string, currentDir: string, regex: RegExp): string[] {
            const results: string[] = []
            const items = fs.readdirSync(currentDir)
            
            for (const item of items) {
              const fullPath = path.join(currentDir, item)
              const stat = fs.statSync(fullPath)
              
              if (stat.isDirectory()) {
                const subFiles = scanDirectory(baseDir, fullPath, regex)
                results.push(...subFiles)
              } else if (stat.isFile() && regex.test(item)) {
                const relativePath = path.relative(baseDir, fullPath)
                results.push(relativePath)
              }
            }
            return results
          }

          const files = args.recursive 
            ? scanDirectory(dirPath, dirPath, regex)
            : fs.readdirSync(dirPath).filter(f => regex.test(f) && fs.statSync(path.join(dirPath, f)).isFile())

          if (files.length === 0) {
            return `❌ 没有匹配 ".${ext}" 的文件`
          }

          queue.mode = "directory"
          queue.dirPath = dirPath
          queue.files = files
          queue.prompt = args.prompt
          queue.taskItems = []
          queue.currentIndex = 0
          queue.results = []
          queue.running = false
          queue.batchSize = args.batchSize || 1

          let result = `✅ 队列已创建（目录扫描模式）\n\n文件数: ${files.length}\n`
          files.slice(0, 10).forEach((f, i) => result += `  ${i + 1}. ${f}\n`)
          if (files.length > 10) result += `  ... 还有 ${files.length - 10} 个\n`

          return result
        },
      }),

      // 文件列表模式（MR 场景）
      "task-create-files": tool({
        description: "创建任务队列（文件列表模式，适用于 MR 场景）",
        args: {
          files: tool.schema.string().describe("JSON 格式的文件列表，每个文件包含 filename 和 prompt"),
          batchSize: tool.schema.number().optional().default(1).describe("并行数"),
        },
        async execute(args) {
          let taskItems: TaskItem[]
          
          try {
            taskItems = JSON.parse(args.files)
          } catch (e) {
            return `❌ JSON 解析失败: ${e}\n\n格式示例:\n[\n  {"filename": "src/main/java/Service.java", "prompt": "为新增方法生成测试"}\n]`
          }
          
          if (!Array.isArray(taskItems) || taskItems.length === 0) {
            return `❌ 文件列表为空`
          }

          // 验证格式
          for (const item of taskItems) {
            if (!item.filename || !item.prompt) {
              return `❌ 格式错误：每个文件需要 filename 和 prompt 字段`
            }
          }

          queue.mode = "filelist"
          queue.taskItems = taskItems
          queue.files = []
          queue.dirPath = ""
          queue.prompt = ""
          queue.currentIndex = 0
          queue.results = []
          queue.running = false
          queue.batchSize = args.batchSize || 1

          let result = `✅ 队列已创建（文件列表模式）\n\n文件数: ${taskItems.length}\n\n`
          taskItems.slice(0, 10).forEach((item, i) => {
            result += `  ${i + 1}. ${item.filename}\n`
            if (item.metadata?.changeType) {
              result += `     变更类型: ${item.metadata.changeType}\n`
            }
          })
          if (taskItems.length > 10) result += `  ... 还有 ${taskItems.length - 10} 个\n`

          return result
        },
      }),

      "task-start": tool({
        description: "启动队列执行",
        args: {},
        async execute() {
          const totalTasks = queue.mode === "filelist" ? queue.taskItems.length : queue.files.length
          
          if (totalTasks === 0) {
            return "❌ 队列为空，请先运行 task-create 或 task-create-files"
          }

          if (queue.running) {
            return `❌ 队列正在执行中\n当前: ${queue.currentIndex}/${totalTasks}`
          }

          // 如果 batchSize > 1，初始化工作空间池
          if (queue.batchSize > 1) {
            if (!queue.workspacePool) {
              queue.workspacePool = createWorkspacePool(directory, queue.batchSize)
            }
            // 初始化池子
            const initialized = await queue.workspacePool.initialize()
            if (!initialized) {
              return "❌ 工作空间池初始化失败"
            }
            // 初始化任务-槽位映射
            queue.taskSlotMap = new Map()
          }

          queue.running = true
          queue.currentIndex = 0
          queue.results = []

          await client.tui.openSessions()
          executeAllTasks()

          return `✅ 队列已启动\n\n总任务: ${totalTasks}\n模式: ${queue.mode === "filelist" ? "文件列表" : "目录扫描"}\n并行数: ${queue.batchSize}\n${queue.batchSize > 1 ? "工作空间池: 已启用\n" : ""}\n📌 任务会自动执行\n📌 运行 task-status 查看进度`
        },
      }),

      "task-status": tool({
        description: "查看队列状态",
        args: {},
        async execute() {
          const totalTasks = queue.mode === "filelist" ? queue.taskItems.length : queue.files.length
          
          if (totalTasks === 0) {
            return "📭 队列为空"
          }

          const success = queue.results.filter(t => t.status === "success").length
          const failed = queue.results.filter(t => t.status === "failed").length
          const remaining = totalTasks - queue.currentIndex

          let result = `📊 队列状态\n\n`
          result += `模式: ${queue.mode === "filelist" ? "文件列表" : "目录扫描"}\n`
          result += `运行中: ${queue.running ? "✅" : "⏸️"}\n`
          result += `总计: ${totalTasks}\n`
          result += `成功: ${success}\n`
          result += `失败: ${failed}\n`
          result += `待执行: ${remaining}\n`

          if (queue.currentSessionId) {
            const currentTask = queue.results.find(t => t.sessionId === queue.currentSessionId)
            if (currentTask) {
              result += `\n🔄 正在执行: ${currentTask.filename}`
            }
          } else if (!queue.running && queue.currentIndex >= totalTasks && totalTasks > 0) {
            result += `\n\n✅ 所有任务已完成`
          }

          return result
        },
      }),

      "task-stop": tool({
        description: "停止队列",
        args: {},
        async execute() {
          queue.running = false
          const totalTasks = queue.mode === "filelist" ? queue.taskItems.length : queue.files.length
          
          // 销毁工作空间池（删除所有槽位）
          if (queue.workspacePool) {
            queue.workspacePool.destroy()
            queue.workspacePool = undefined
            queue.taskSlotMap = undefined
          }
          
          return `⏸️ 队列已停止\n\n已完成: ${queue.currentIndex}/${totalTasks}`
        },
      }),

      "task-summary": tool({
        description: "汇总结果",
        args: {},
        async execute() {
          if (queue.results.length === 0) {
            return "📭 暂无结果，请先运行 task-start"
          }

          const success = queue.results.filter(t => t.status === "success")
          const failed = queue.results.filter(t => t.status === "failed")

          let result = `📊 任务汇总\n\n`
          result += `总计: ${queue.results.length}\n`
          result += `成功: ${success.length}\n`
          result += `失败: ${failed.length}\n`
          result += `${"─".repeat(40)}\n\n`

          for (const task of queue.results) {
            const icon = task.status === "success" ? "✅" : "❌"
            result += `${icon} ${task.filename}\n`
            if (task.summary) {
              result += `   ${task.summary.slice(0, 100)}${task.summary.length > 100 ? "..." : ""}\n`
            }
            if (task.error) {
              result += `   错误: ${task.error}\n`
            }
            result += `\n`
          }

          return result
        },
      }),

      "sessions": tool({
        description: "打开 Session 选择器",
        args: {},
        async execute() {
          await client.tui.openSessions()
          return "✅ 已打开 Session 选择器"
        },
      }),

      // Maven 工具集
      "maven-compile": tool({
        description: "编译测试代码",
        args: {},
        async execute(args, context) {
          const config = loadMavenConfig(context.directory)
          const mvnArgs = buildMavenArgs(config, ["test-compile"])

          try {
            const output = execSync(`mvn ${mvnArgs.join(" ")}`, {
              cwd: context.directory,
              encoding: "utf-8",
              timeout: config.maven.timeout || 300000,
              stdio: ["pipe", "pipe", "pipe"]
            })
            return parseCompileResult(output)
          } catch (error: any) {
            return parseCompileResult(error.stdout || error.message)
          }
        }
      }),

      "maven-test": tool({
        description: "运行测试（支持项目级/目录级/类级）",
        args: {
          target: tool.schema.string().optional().describe("测试目标：类名或包路径（项目级时不需要）"),
          level: tool.schema.enum(["project", "package", "class"]).optional().default("project").describe("测试级别")
        },
        async execute(args, context) {
          const config = loadMavenConfig(context.directory)

          let testArg: string
          if (args.level === "project" || !args.target) {
            testArg = "test"
          } else if (args.level === "package") {
            testArg = `test -Dtest="${args.target}.*"`
          } else {
            testArg = `test -Dtest=${args.target}`
          }

          const mvnArgs = buildMavenArgs(config, testArg.split(" "))

          try {
            const output = execSync(`mvn ${mvnArgs.join(" ")}`, {
              cwd: context.directory,
              encoding: "utf-8",
              timeout: config.maven.timeout || 300000,
              stdio: ["pipe", "pipe", "pipe"]
            })
            return parseTestResult(output)
          } catch (error: any) {
            return parseTestResult(error.stdout || error.message)
          }
        }
      }),

      "maven-coverage": tool({
        description: "生成覆盖率报告",
        args: {},
        async execute(args, context) {
          const config = loadMavenConfig(context.directory)
          const mvnArgs = buildMavenArgs(config, ["jacoco:report"])

          try {
            const output = execSync(`mvn ${mvnArgs.join(" ")}`, {
              cwd: context.directory,
              encoding: "utf-8",
              timeout: config.maven.timeout || 300000,
              stdio: ["pipe", "pipe", "pipe"]
            })
            return parseCoverageResult(output, context.directory)
          } catch (error: any) {
            return parseCoverageResult(error.stdout || "", context.directory)
          }
        }
      }),
    },
  }
}

export default TaskManagerPlugin