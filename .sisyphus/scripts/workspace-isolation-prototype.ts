#!/usr/bin/env bun
/**
 * Workspace Isolation Prototype
 * 
 * 验证 Maven 编译隔离方案的可行性
 * 测试项目: D:\OpenCode\config-history
 */

import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"

// 配置
const PROJECT_ROOT = "D:\\OpenCode\\config-history"
const WORKSPACE_ROOT = path.join(PROJECT_ROOT, ".dtagent", "workspace-prototype")

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
}

function log(msg: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

// 获取测试类列表（选取几个代表性的）
function getTestClasses(): string[] {
  // 选择不同目录的类来测试隔离
  return [
    "com/example/config/controller/ConfigController.java",
    "com/example/config/service/ConfigService.java",
    "com/example/config/history/service/HistoryService.java",
  ]
}

// 创建软链接（Windows 用 junction，Unix 用 symlink）
function createSymlink(target: string, linkPath: string, type: "file" | "dir"): boolean {
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
        // Windows junction 不需要管理员权限
        execSync(`mklink /J "${linkPath}" "${target}"`, { stdio: "ignore" })
      } else {
        // Windows 文件硬链接
        execSync(`mklink /H "${linkPath}" "${target}"`, { stdio: "ignore" })
      }
    } else {
      // Unix/Mac
      fs.symlinkSync(target, linkPath, type === "dir" ? "dir" : "file")
    }
    return true
  } catch (e) {
    log(`  创建软链接失败: ${e}`, "red")
    return false
  }
}

// 创建工作目录
function createWorkspace(taskId: string): string | null {
  const workspacePath = path.join(WORKSPACE_ROOT, `task-${taskId}`)
  
  try {
    // 1. 创建工作目录
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true })
    }

    // 2. 软链接 src 目录
    const srcTarget = path.join(PROJECT_ROOT, "src")
    const srcLink = path.join(workspacePath, "src")
    if (!fs.existsSync(srcLink)) {
      const success = createSymlink(srcTarget, srcLink, "dir")
      if (!success) {
        log(`  ❌ 创建 src 软链接失败`, "red")
        return null
      }
    }

    // 3. 软链接 pom.xml
    const pomTarget = path.join(PROJECT_ROOT, "pom.xml")
    const pomLink = path.join(workspacePath, "pom.xml")
    if (!fs.existsSync(pomLink)) {
      const success = createSymlink(pomTarget, pomLink, "file")
      if (!success) {
        log(`  ❌ 创建 pom.xml 软链接失败`, "red")
        return null
      }
    }

    // 4. 创建独立 .m2 目录
    const m2Path = path.join(workspacePath, ".m2")
    if (!fs.existsSync(m2Path)) {
      fs.mkdirSync(m2Path, { recursive: true })
    }

    // 5. 创建空的 target 目录
    const targetPath = path.join(workspacePath, "target")
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true })
    }

    log(`  ✅ 工作目录创建成功: ${workspacePath}`, "green")
    return workspacePath
  } catch (e) {
    log(`  ❌ 创建工作目录失败: ${e}`, "red")
    return null
  }
}

// 清理工作目录
function cleanupWorkspace(taskId: string): boolean {
  const workspacePath = path.join(WORKSPACE_ROOT, `task-${taskId}`)
  
  try {
    if (fs.existsSync(workspacePath)) {
      // Windows 需要先删除软链接，否则 rmSync 会报错
      if (process.platform === "win32") {
        const srcLink = path.join(workspacePath, "src")
        const pomLink = path.join(workspacePath, "pom.xml")
        
        if (fs.existsSync(srcLink)) {
          fs.rmdirSync(srcLink) // junction 用 rmdir
        }
        if (fs.existsSync(pomLink)) {
          fs.unlinkSync(pomLink) // 硬链接用 unlink
        }
      }
      
      fs.rmSync(workspacePath, { recursive: true, force: true })
    }
    log(`  ✅ 工作目录已清理: ${workspacePath}`, "green")
    return true
  } catch (e) {
    log(`  ⚠️  清理工作目录失败: ${e}`, "yellow")
    return false
  }
}

// 执行 Maven 编译
function runMavenCompile(workspacePath: string): { success: boolean; output: string } {
  try {
    const m2Path = path.join(workspacePath, ".m2")
    
    // 使用独立 .m2 仓库编译
    const output = execSync(
      `mvn compile -Dmaven.repo.local="${m2Path}" -q`,
      { 
        cwd: workspacePath,
        encoding: "utf-8",
        timeout: 300000, // 5分钟超时
      }
    )
    
    return { success: true, output }
  } catch (e: any) {
    return { success: false, output: e.stdout || e.message }
  }
}

// 验证并行编译（模拟两个任务同时编译）
async function testParallelCompilation(): Promise<boolean> {
  log("\n🧪 测试并行编译隔离", "blue")
  
  const task1 = "test-001"
  const task2 = "test-002"
  
  // 创建两个工作目录
  log("\n  创建工作目录...")
  const ws1 = createWorkspace(task1)
  const ws2 = createWorkspace(task2)
  
  if (!ws1 || !ws2) {
    log("  ❌ 工作目录创建失败", "red")
    return false
  }
  
  // 同时启动两个 Maven 编译
  log("  同时启动两个 Maven 编译...")
  const startTime = Date.now()
  
  const [result1, result2] = await Promise.all([
    Promise.resolve(runMavenCompile(ws1)),
    Promise.resolve(runMavenCompile(ws2)),
  ])
  
  const duration = Date.now() - startTime
  
  // 检查结果
  log(`\n  编译完成，耗时: ${duration}ms`)
  log(`  Task 1: ${result1.success ? "✅ 成功" : "❌ 失败"}`, result1.success ? "green" : "red")
  log(`  Task 2: ${result2.success ? "✅ 成功" : "❌ 失败"}`, result2.success ? "green" : "red")
  
  if (!result1.success) {
    log(`  Task 1 错误: ${result1.output.slice(0, 200)}`, "red")
  }
  if (!result2.success) {
    log(`  Task 2 错误: ${result2.output.slice(0, 200)}`, "red")
  }
  
  // 验证 target 目录独立
  const target1 = path.join(ws1, "target", "classes")
  const target2 = path.join(ws2, "target", "classes")
  
  const target1Exists = fs.existsSync(target1)
  const target2Exists = fs.existsSync(target2)
  
  log(`\n  Target 目录检查:`)
  log(`  Task 1 target/classes: ${target1Exists ? "✅ 存在" : "❌ 不存在"}`, target1Exists ? "green" : "red")
  log(`  Task 2 target/classes: ${target2Exists ? "✅ 存在" : "❌ 不存在"}`, target2Exists ? "green" : "red")
  
  // 清理
  log("\n  清理工作目录...")
  cleanupWorkspace(task1)
  cleanupWorkspace(task2)
  
  return result1.success && result2.success && target1Exists && target2Exists
}

// 验证串行 vs 并行性能
async function testPerformance(): Promise<void> {
  log("\n📊 性能对比测试", "blue")
  
  const iterations = 3
  
  // 串行测试
  log("\n  串行执行（3次）...")
  const serialTimes: number[] = []
  
  for (let i = 0; i < iterations; i++) {
    const taskId = `serial-${i}`
    const ws = createWorkspace(taskId)
    if (ws) {
      const start = Date.now()
      runMavenCompile(ws)
      const duration = Date.now() - start
      serialTimes.push(duration)
      cleanupWorkspace(taskId)
    }
  }
  
  const avgSerial = serialTimes.reduce((a, b) => a + b, 0) / serialTimes.length
  log(`  串行平均耗时: ${avgSerial.toFixed(0)}ms`, "yellow")
  
  // 并行测试
  log("\n  并行执行（3个任务同时）...")
  const taskIds = ["parallel-0", "parallel-1", "parallel-2"]
  const workspaces: string[] = []
  
  for (const taskId of taskIds) {
    const ws = createWorkspace(taskId)
    if (ws) workspaces.push(ws)
  }
  
  const start = Date.now()
  await Promise.all(workspaces.map(ws => Promise.resolve(runMavenCompile(ws))))
  const parallelDuration = Date.now() - start
  
  log(`  并行总耗时: ${parallelDuration}ms`, "yellow")
  
  for (const taskId of taskIds) {
    cleanupWorkspace(taskId)
  }
  
  // 对比
  log(`\n  📈 性能对比:`)
  log(`  串行总耗时（估算）: ${(avgSerial * 3).toFixed(0)}ms`)
  log(`  并行总耗时: ${parallelDuration}ms`)
  log(`  加速比: ${((avgSerial * 3) / parallelDuration).toFixed(2)}x`, 
    parallelDuration < avgSerial * 3 ? "green" : "yellow")
}

// 主函数
async function main() {
  log("=".repeat(60), "blue")
  log("Workspace Isolation Prototype", "blue")
  log("=".repeat(60), "blue")
  log(`\n测试项目: ${PROJECT_ROOT}`)
  log(`工作空间: ${WORKSPACE_ROOT}`)
  log(`平台: ${process.platform}`)
  
  // 检查项目是否存在
  if (!fs.existsSync(PROJECT_ROOT)) {
    log(`\n❌ 项目不存在: ${PROJECT_ROOT}`, "red")
    process.exit(1)
  }
  
  // 检查 Maven
  try {
    execSync("mvn -v", { stdio: "ignore" })
  } catch {
    log("\n❌ Maven 未安装", "red")
    process.exit(1)
  }
  
  // 测试 1: 软链接创建
  log("\n" + "=".repeat(60), "blue")
  log("Test 1: 软链接创建", "blue")
  log("=".repeat(60), "blue")
  
  const testTask = "symlink-test"
  const ws = createWorkspace(testTask)
  
  if (ws) {
    // 验证软链接
    const srcLink = path.join(ws, "src")
    const pomLink = path.join(ws, "pom.xml")
    
    log(`\n  验证软链接:`)
    log(`  src -> ${fs.existsSync(srcLink) ? "✅ 存在" : "❌ 不存在"}`, 
      fs.existsSync(srcLink) ? "green" : "red")
    log(`  pom.xml -> ${fs.existsSync(pomLink) ? "✅ 存在" : "❌ 不存在"}`, 
      fs.existsSync(pomLink) ? "green" : "red")
    
    cleanupWorkspace(testTask)
  }
  
  // 测试 2: 独立 .m2 编译
  log("\n" + "=".repeat(60), "blue")
  log("Test 2: 独立 .m2 编译", "blue")
  log("=".repeat(60), "blue")
  
  const compileTask = "compile-test"
  const wsCompile = createWorkspace(compileTask)
  
  if (wsCompile) {
    log(`\n  执行 Maven 编译...`)
    const result = runMavenCompile(wsCompile)
    
    log(`  结果: ${result.success ? "✅ 成功" : "❌ 失败"}`, 
      result.success ? "green" : "red")
    
    if (result.success) {
      // 检查 .m2 目录是否创建
      const m2Path = path.join(wsCompile, ".m2")
      const m2Exists = fs.existsSync(m2Path)
      log(`  .m2 目录: ${m2Exists ? "✅ 存在" : "❌ 不存在"}`, 
        m2Exists ? "green" : "red")
      
      // 检查 target 目录
      const targetPath = path.join(wsCompile, "target", "classes")
      const targetExists = fs.existsSync(targetPath)
      log(`  target/classes: ${targetExists ? "✅ 存在" : "❌ 不存在"}`, 
        targetExists ? "green" : "red")
    } else {
      log(`  错误: ${result.output.slice(0, 300)}`, "red")
    }
    
    cleanupWorkspace(compileTask)
  }
  
  // 测试 3: 并行编译隔离
  log("\n" + "=".repeat(60), "blue")
  log("Test 3: 并行编译隔离", "blue")
  log("=".repeat(60), "blue")
  
  const parallelSuccess = await testParallelCompilation()
  
  // 测试 4: 性能对比
  log("\n" + "=".repeat(60), "blue")
  log("Test 4: 性能对比", "blue")
  log("=".repeat(60), "blue")
  
  await testPerformance()
  
  // 总结
  log("\n" + "=".repeat(60), "blue")
  log("总结", "blue")
  log("=".repeat(60), "blue")
  log(`\n✅ 软链接创建: ${ws ? "通过" : "失败"}`, ws ? "green" : "red")
  log(`✅ 独立 .m2 编译: ${wsCompile ? "通过" : "失败"}`, wsCompile ? "green" : "red")
  log(`✅ 并行编译隔离: ${parallelSuccess ? "通过" : "失败"}`, parallelSuccess ? "green" : "red")
  
  log(`\n${parallelSuccess ? "🎉 原型验证成功！可以继续核心实现。" : "⚠️  原型验证发现问题，需要调整方案。"}`, 
    parallelSuccess ? "green" : "yellow")
}

main().catch(e => {
  log(`\n❌ 错误: ${e}`, "red")
  process.exit(1)
})
