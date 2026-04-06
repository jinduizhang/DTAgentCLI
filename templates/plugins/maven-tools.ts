import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import AsyncLock from "async-lock"

// Global lock for Maven operations
const mavenLock = new AsyncLock()

// Maven config interface
interface MavenConfig {
  maven: {
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

function loadMavenConfig(projectDir: string): MavenConfig {
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

function buildMavenArgs(config: MavenConfig, baseArgs: string[]): string[] {
  const args = [...baseArgs, "-q"]
  
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

function filterMavenOutput(output: string): string {
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

function parseTestResult(output: string): string {
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

function parseCoverageResult(output: string, projectDir: string): string {
  const reportPath = path.join(projectDir, "target", "site", "jacoco", "index.html")
  
  if (fs.existsSync(reportPath)) {
    return `✅ 覆盖率报告已生成
- 报告路径: target/site/jacoco/index.html`
  } else {
    const filtered = filterMavenOutput(output)
    return `❌ 覆盖率报告生成失败\n${filtered}`
  }
}

export const MavenToolsPlugin: Plugin = async ({ client, directory }) => {
  return {
    tool: {
      "maven-test": tool({
        description: "运行测试（支持项目级/目录级/类级）",
        args: {
          target: tool.schema.string().optional().describe("测试目标：类名或包路径"),
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
          
          return mavenLock.acquire("mvn-test", async () => {
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
          })
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
      })
    }
  }
}

export default MavenToolsPlugin