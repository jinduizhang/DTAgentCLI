/**
 * Maven 配置和工具函数
 * 
 * 功能:
 * - 读取 .dtagent/config.json 配置
 * - 输出过滤（只显示 ERROR 和失败测试名）
 * - 解析测试结果
 */

import * as fs from "fs"
import * as path from "path"

export interface MavenConfig {
  maven: {
    repoPath?: string
    settings?: string
    profiles?: string
    jvmArgs?: string
    timeout?: number
  }
}

const DEFAULT_CONFIG: MavenConfig = {
  maven: {
    timeout: 300000
  }
}

export function loadMavenConfig(projectDir: string): MavenConfig {
  const configPath = path.join(projectDir, ".dtagent", "config.json")
  
  try {
    if (!fs.existsSync(configPath)) {
      return DEFAULT_CONFIG
    }
    
    const content = fs.readFileSync(configPath, "utf-8")
    const config = JSON.parse(content) as MavenConfig
    
    return {
      maven: {
        ...DEFAULT_CONFIG.maven,
        ...config.maven
      }
    }
  } catch (error) {
    console.error(`[MavenConfig] 读取配置失败: ${error}`)
    return DEFAULT_CONFIG
  }
}

export function buildMavenArgs(config: MavenConfig, baseArgs: string[]): string[] {
  const args = [...baseArgs, "-q"]
  
  if (config.maven.repoPath) {
    args.push(`-Dmaven.repo.local=${config.maven.repoPath}`)
  }
  
  if (config.maven.settings) {
    args.push("-s", config.maven.settings)
  }
  
  if (config.maven.profiles) {
    args.push("-P", config.maven.profiles)
  }
  
  if (config.maven.jvmArgs) {
    args.push(config.maven.jvmArgs)
  }
  
  return args
}

export function filterMavenOutput(output: string): string {
  if (!output) return ""
  
  const lines = output.split("\n")
  const filtered: string[] = []
  
  for (const line of lines) {
    if (line.includes("[ERROR]")) {
      filtered.push(line)
    }
    if (line.includes("Tests run:") || line.includes("Failed tests:")) {
      filtered.push(line)
    }
    if (line.includes("BUILD SUCCESS") || line.includes("BUILD FAILURE")) {
      filtered.push(line)
    }
  }
  
  return filtered.join("\n")
}

export function parseTestResult(output: string): string {
  const testsMatch = output.match(/Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/)
  
  if (!testsMatch) {
    return `❌ 无测试结果\n${filterMavenOutput(output)}`
  }
  
  const total = parseInt(testsMatch[1])
  const failures = parseInt(testsMatch[2])
  const errors = parseInt(testsMatch[3])
  const skipped = parseInt(testsMatch[4])
  const passed = total - failures - errors - skipped
  const successRate = total > 0 ? Math.round((passed / total) * 100) : 0
  
  if (failures === 0 && errors === 0) {
    return `✅ 测试通过
- 测试数: ${total}
- 通过: ${passed}
- 失败: 0
- 跳过: ${skipped}
- 成功率: ${successRate}%`
  } else {
    const filtered = filterMavenOutput(output)
    return `❌ 测试失败
- 测试数: ${total}
- 通过: ${passed}
- 失败: ${failures + errors}
- 跳过: ${skipped}
- 成功率: ${successRate}%

${filtered}`
  }
}

export function parseCompileResult(output: string): string {
  if (output.includes("BUILD SUCCESS")) {
    return `✅ 编译成功`
  } else if (output.includes("BUILD FAILURE")) {
    return `❌ 编译失败\n${filterMavenOutput(output)}`
  } else {
    return filterMavenOutput(output) || "✅ 编译完成"
  }
}

export function parseCoverageResult(output: string, projectDir: string): string {
  const reportPath = path.join(projectDir, "target", "site", "jacoco", "index.html")
  
  if (fs.existsSync(reportPath)) {
    return `✅ 覆盖率报告已生成
- 报告路径: target/site/jacoco/index.html`
  } else {
    const filtered = filterMavenOutput(output)
    return `❌ 覆盖率报告生成失败\n${filtered}`
  }
}