import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"

// Bare Repo Worktree 模式（编译后的 JS 路径）
const BARE_REPO_PATH = path.resolve(__dirname, "../../dist/core/bare-repo")

/**
 * OpenCode Task Manager Plugin
 *
 * 支持三种模式：
 * 1. 目录扫描模式：task-create
 * 2. 文件列表模式：task-create-files（MR 场景）
 * 3. Bare Repo Worktree 模式：task-bare-create（真正的并行隔离）
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

  // 执行单个任务（支持两种模式）
  async function executeTask(index: number): Promise<{ success: boolean; summary?: string; error?: string }> {
    let filename: string
    let fullPrompt: string
    let taskId: string

    if (queue.mode === "filelist") {
      // 文件列表模式
      const task = queue.taskItems[index]
      filename = task.filename
      const absolutePath = path.resolve(directory, task.filename)
      taskId = `task-${index}-${path.basename(filename, path.extname(filename))}`
      fullPrompt = `【文件路径：${absolutePath}】\n${task.prompt}`
    } else {
      // 目录扫描模式
      filename = queue.files[index]
      const absolutePath = path.resolve(queue.dirPath, filename)
      taskId = `task-${index}-${path.basename(filename, path.extname(filename))}`
      const userPrompt = queue.prompt.replace(/{filename}/g, filename)
      fullPrompt = `【文件路径：${absolutePath}】\n\n${userPrompt}`
    }

    const baseName = path.basename(filename)
    const title = baseName

    const session = await client.session.create({
      body: { title }
    })
    if (!session.data) {
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
      return { success: true, summary }
    } catch (e) {
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

          queue.running = true
          queue.currentIndex = 0
          queue.results = []

          await client.tui.openSessions()
          executeAllTasks()

          return `✅ 队列已启动\n\n总任务: ${totalTasks}\n模式: ${queue.mode === "filelist" ? "文件列表" : "目录扫描"}\n并行数: ${queue.batchSize}\n📌 任务会自动执行\n📌 运行 task-status 查看进度`
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

      // ============ Bare Repo Worktree 模式 ============
      
      /**
       * Bare Repo 模式：创建任务队列
       * 
       * 与普通模式不同，此模式会：
       * 1. 检查项目是否已转换为 Bare Repo
       * 2. 使用 Worktree 创建独立的执行环境
       * 3. 每个 Worktree 有独立的 .m2 目录，避免 Maven 冲突
       */
      "task-bare-create": tool({
        description: "创建任务队列（Bare Repo Worktree 模式）- 真正的并行隔离执行",
        args: {
          dir: tool.schema.string().describe("目录路径"),
          ext: tool.schema.string().optional().default("java").describe("文件后缀"),
          recursive: tool.schema.boolean().optional().default(false).describe("递归扫描"),
          batchSize: tool.schema.number().optional().default(2).describe("并行组数（每个组独立 Worktree）"),
          prompt: tool.schema.string().optional().describe("自定义任务提示词"),
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

          // 过滤掉测试文件
          const sourceFiles = files.filter(f => !f.includes("Test") && !f.includes("Tests"))
          
          // 设置 Bare Repo 队列状态
          queue.mode = "directory"
          queue.dirPath = dirPath
          queue.files = sourceFiles
          queue.prompt = args.prompt || "执行端到端测试生成：\n1. 加载 generate-java-ut 生成测试\n2. 加载 fix-java-ut 修复测试\n3. 加载 java-coverage 提升覆盖率\n源文件: {filename}"
          queue.taskItems = []
          queue.currentIndex = 0
          queue.results = []
          queue.running = false
          queue.batchSize = args.batchSize || 2

          let result = `✅ Bare Repo 任务队列已创建\n\n`
          result += `📁 目录: ${dirPath}\n`
          result += `📄 文件数: ${sourceFiles.length}\n`
          result += `⚡ 并行组数: ${queue.batchSize}\n`
          result += `🔄 模式: Bare Repo Worktree（真正的并行隔离）\n\n`
          result += `文件列表（前 10 个）:\n`
          sourceFiles.slice(0, 10).forEach((f, i) => result += `  ${i + 1}. ${f}\n`)
          if (sourceFiles.length > 10) result += `  ... 还有 ${sourceFiles.length - 10} 个\n`

          return result
        },
      }),

      /**
       * Bare Repo 模式：启动任务执行
       * 
       * 使用 BareRepoExecutor 执行：
       * 1. 将文件分组
       * 2. 为每个组创建独立 Worktree
       * 3. 在 Worktree 中创建 Session 并执行任务
       * 4. 自动清理 Worktree
       */
      "task-bare-start": tool({
        description: "启动 Bare Repo 模式任务执行（真正的 Worktree 并行隔离）",
        args: {},
        async execute() {
          if (queue.files.length === 0) {
            return "❌ 队列为空，请先运行 task-bare-create"
          }

          if (queue.running) {
            return `❌ 队列正在执行中\n当前: ${queue.currentIndex}/${queue.files.length}`
          }

          // 动态加载 BareRepoExecutor
          let BareRepoExecutor: any
          let createFileExecutor: any
          
          try {
            const bareRepoModule = require(BARE_REPO_PATH)
            BareRepoExecutor = bareRepoModule.BareRepoExecutor
            createFileExecutor = bareRepoModule.createFileExecutor
          } catch (e) {
            return `❌ Bare Repo 模块未加载，请先运行 npm run build\n错误: ${e}`
          }

          queue.running = true

          // 创建执行器
          const executor = new BareRepoExecutor(queue.dirPath)
          
          // 构建执行函数
          const promptBuilder = (file: string) => {
            const userPrompt = queue.prompt.replace(/{filename}/g, file)
            return `【文件路径：${path.resolve(queue.dirPath, file)}】\n\n${userPrompt}`
          }
          
          const executeFileFn = createFileExecutor(client, directory, promptBuilder)

          // 异步执行（不阻塞）
          executor.execute(queue.files, queue.batchSize, executeFileFn)
            .then((result: any) => {
              queue.running = false
              queue.currentIndex = queue.files.length
              
              // 更新结果
              for (const fileResult of result.results) {
                queue.results.push({
                  filename: fileResult.filename,
                  sessionId: fileResult.sessionId || "",
                  status: fileResult.success ? "success" : "failed",
                  summary: fileResult.summary,
                  error: fileResult.error
                })
              }
              
              console.log("[BareRepo] Execution completed:", result.success ? "✅ 成功" : "❌ 失败")
              if (result.report) {
                console.log("[BareRepo] Report saved to:", result.report)
              }
            })
            .catch((error: any) => {
              queue.running = false
              console.error("[BareRepo] Execution failed:", error)
            })

          await client.tui.openSessions()

          let response = `✅ Bare Repo 任务已启动\n\n`
          response += `📁 目录: ${queue.dirPath}\n`
          response += `📄 文件数: ${queue.files.length}\n`
          response += `⚡ 并行组数: ${queue.batchSize}\n`
          response += `🔄 模式: Bare Repo Worktree\n\n`
          response += `📌 每个组在独立 Worktree 中执行，拥有独立的 .m2 目录\n`
          response += `📌 任务会自动执行并清理 Worktree\n`
          response += `📌 运行 task-status 查看进度\n`
          response += `⚠️ 请勿关闭当前窗口`

          return response
        },
      }),

      /**
       * Bare Repo 模式：停止执行并清理
       */
      "task-bare-stop": tool({
        description: "停止 Bare Repo 任务并清理所有 Worktree",
        args: {},
        async execute() {
          queue.running = false

          // 动态加载并清理
          try {
            const bareRepoModule = require(BARE_REPO_PATH)
            const BareRepoExecutor = bareRepoModule.BareRepoExecutor
            const executor = new BareRepoExecutor(queue.dirPath)
            await executor.stop()
          } catch (e) {
            console.warn("[BareRepo] Cleanup warning:", e)
          }

          return `⏸️ Bare Repo 任务已停止\n\n已清理所有 Worktree\n已完成: ${queue.currentIndex}/${queue.files.length}`
        },
      }),
    },
  }
}

export default TaskManagerPlugin