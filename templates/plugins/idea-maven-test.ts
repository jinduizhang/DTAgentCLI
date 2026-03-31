import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"
import * as xml2js from "xml2js"

/**
 * IDEA Maven 测试运行器插件
 * 
 * 功能：
 * 1. 自动读取 IntelliJ IDEA 项目配置
 * 2. 提取 JDK、Maven、本地仓库等配置
 * 3. 组装并执行 mvn test 命令
 * 4. 支持从 workspace.xml 读取选中的测试类
 */

// IDEA 配置接口
interface IDEAConfig {
  projectPath: string
  jdkName: string
  jdkPath: string
  mavenHome: string
  localRepository: string
  userSettingsFile: string
  selectedTestClass?: string
  languageLevel?: string
}

// 命令执行结果
interface MavenResult {
  success: boolean
  command: string
  output?: string
  error?: string
  exitCode?: number
}

/**
 * 解析 XML 文件
 */
async function parseXML(filePath: string): Promise<any> {
  if (!fs.existsSync(filePath)) {
    return null
  }
  
  const content = fs.readFileSync(filePath, "utf-8")
  const parser = new xml2js.Parser({ explicitArray: false })
  
  try {
    return await parser.parseStringPromise(content)
  } catch (e) {
    return null
  }
}

/**
 * 查找 IDEA 的 jdk.table.xml 路径
 */
function findJDKTablePath(): string | null {
  const homeDir = process.env.USERPROFILE || process.env.HOME || ""
  
  if (process.platform === "win32") {
    // Windows
    const basePath = path.join(homeDir, "AppData", "Roaming", "JetBrains")
    if (fs.existsSync(basePath)) {
      const dirs = fs.readdirSync(basePath)
        .filter(d => d.startsWith("IntelliJIdea"))
        .sort()
        .reverse()
      
      for (const dir of dirs) {
        const jdkTablePath = path.join(basePath, dir, "options", "jdk.table.xml")
        if (fs.existsSync(jdkTablePath)) {
          return jdkTablePath
        }
      }
    }
  } else if (process.platform === "darwin") {
    // macOS
    const basePath = path.join(homeDir, "Library", "Application Support", "JetBrains")
    if (fs.existsSync(basePath)) {
      const dirs = fs.readdirSync(basePath)
        .filter(d => d.startsWith("IntelliJIdea"))
        .sort()
        .reverse()
      
      for (const dir of dirs) {
        const jdkTablePath = path.join(basePath, dir, "options", "jdk.table.xml")
        if (fs.existsSync(jdkTablePath)) {
          return jdkTablePath
        }
      }
    }
  } else {
    // Linux
    const basePath = path.join(homeDir, ".config", "JetBrains")
    if (fs.existsSync(basePath)) {
      const dirs = fs.readdirSync(basePath)
        .filter(d => d.startsWith("IntelliJIdea"))
        .sort()
        .reverse()
      
      for (const dir of dirs) {
        const jdkTablePath = path.join(basePath, dir, "options", "jdk.table.xml")
        if (fs.existsSync(jdkTablePath)) {
          return jdkTablePath
        }
      }
    }
  }
  
  return null
}

/**
 * 从 jdk.table.xml 获取 JDK 路径
 */
function getJDKPathFromTable(jdkTablePath: string, jdkName: string): string | null {
  try {
    const content = fs.readFileSync(jdkTablePath, "utf-8")
    
    // 使用正则提取 JDK 配置
    const jdkRegex = new RegExp(
      `<jdk[^>]*>[^]*?<name value="${jdkName}"[^>]*/>[^]*?<homePath value="([^"]+)"`,
      "i"
    )
    
    const match = content.match(jdkRegex)
    if (match) {
      return match[1].replace(/\$\{([^}]+)\}/g, (match, varName) => {
        return process.env[varName] || match
      })
    }
    
    // 备选：尝试模糊匹配
    const allJDKs = content.match(/<jdk[^>]*>[^]*?<\/jdk>/gi) || []
    for (const jdk of allJDKs) {
      if (jdk.includes(`name value="${jdkName}"`) || 
          (jdkName === "21" && jdk.includes('"21"')) ||
          (jdkName === "17" && jdk.includes('"17"')) ||
          (jdkName === "11" && jdk.includes('"11"')) ||
          (jdkName === "1.8" && jdk.includes('"1.8"'))) {
        const homeMatch = jdk.match(/homePath value="([^"]+)"/)
        if (homeMatch) {
          return homeMatch[1].replace(/\$\{([^}]+)\}/g, (match, varName) => {
            return process.env[varName] || match
          })
        }
      }
    }
  } catch (e) {
    console.error("解析 jdk.table.xml 失败:", e)
  }
  
  return null
}

/**
 * 读取 misc.xml 获取 JDK 信息
 */
async function readMiscXml(projectPath: string): Promise<{ jdkName: string; languageLevel: string } | null> {
  const miscPath = path.join(projectPath, ".idea", "misc.xml")
  
  if (!fs.existsSync(miscPath)) {
    return null
  }
  
  const content = fs.readFileSync(miscPath, "utf-8")
  
  // 提取 project-jdk-name
  const jdkNameMatch = content.match(/project-jdk-name="([^"]+)"/)
  const jdkName = jdkNameMatch ? jdkNameMatch[1] : ""
  
  // 提取 languageLevel
  const langLevelMatch = content.match(/languageLevel="JDK_([^"]+)"/)
  const languageLevel = langLevelMatch ? langLevelMatch[1] : ""
  
  if (jdkName || languageLevel) {
    return { jdkName, languageLevel }
  }
  
  return null
}

/**
 * 读取 workspace.xml 获取 Maven 配置和选中的测试类
 */
async function readWorkspaceXml(projectPath: string): Promise<{
  mavenHome: string
  localRepository: string
  userSettingsFile: string
  selectedTestClass?: string
} | null> {
  const workspacePath = path.join(projectPath, ".idea", "workspace.xml")
  
  if (!fs.existsSync(workspacePath)) {
    return null
  }
  
  const content = fs.readFileSync(workspacePath, "utf-8")
  
  // 提取 Maven 配置
  const mavenHomeMatch = content.match(/customMavenHome="([^"]+)"/)
  const mavenHome = mavenHomeMatch ? mavenHomeMatch[1] : ""
  
  const localRepoMatch = content.match(/localRepository="([^"]+)"/)
  const localRepository = localRepoMatch ? localRepoMatch[1] : ""
  
  const settingsFileMatch = content.match(/userSettingsFile="([^"]+)"/)
  const userSettingsFile = settingsFileMatch ? settingsFileMatch[1] : ""
  
  // 提取选中的测试类
  let selectedTestClass: string | undefined
  const runManagerMatch = content.match(/selected="JUnit\.([^"]+)"/)
  if (runManagerMatch) {
    selectedTestClass = runManagerMatch[1]
  }
  
  // 从 JUnit 配置中提取类名
  if (!selectedTestClass) {
    const junitMatch = content.match(/MAIN_CLASS_NAME value="([^"]+Test)"/)
    if (junitMatch) {
      selectedTestClass = junitMatch[1].split(".").pop()
    }
  }
  
  if (mavenHome || localRepository || selectedTestClass) {
    return { mavenHome, localRepository, userSettingsFile, selectedTestClass }
  }
  
  return null
}

/**
 * 读取 compiler.xml 获取编译器配置
 */
async function readCompilerXml(projectPath: string): Promise<any> {
  const compilerPath = path.join(projectPath, ".idea", "compiler.xml")
  
  if (!fs.existsSync(compilerPath)) {
    return null
  }
  
  return parseXML(compilerPath)
}

/**
 * 读取完整的 IDEA 配置
 */
async function readIDEAConfig(projectPath: string): Promise<IDEAConfig | null> {
  // 验证是 IDEA 项目
  if (!fs.existsSync(path.join(projectPath, ".idea"))) {
    throw new Error(`不是 IntelliJ IDEA 项目目录: ${projectPath}`)
  }
  
  // 读取 misc.xml
  const miscConfig = await readMiscXml(projectPath)
  if (!miscConfig) {
    throw new Error("无法读取 misc.xml，请确认是 Maven/Gradle 项目")
  }
  
  // 读取 workspace.xml
  const workspacePath = path.join(projectPath, ".idea", "workspace.xml")
  
  let mavenHome = ""
  let localRepository = ""
  let userSettingsFile = ""
  let selectedTestClass: string | undefined
  
  if (fs.existsSync(workspacePath)) {
    const content = fs.readFileSync(workspacePath, "utf-8")
    
    // 查找 MavenImportPreferences 部分
    const mavenSectionMatch = content.match(/<component name="MavenImportPreferences">[\s\S]*?<\/component>/)
    
    if (mavenSectionMatch) {
      const mavenSection = mavenSectionMatch[0]
      
      // 提取 Maven home
      const mavenHomeMatch = mavenSection.match(/customMavenHome.*?value="([^"]+)"/)
      mavenHome = mavenHomeMatch ? mavenHomeMatch[1] : ""
      
      // 提取本地仓库
      const localRepoMatch = mavenSection.match(/localRepository.*?value="([^"]+)"/)
      localRepository = localRepoMatch ? localRepoMatch[1] : ""
      
      // 提取 settings.xml
      const settingsFileMatch = mavenSection.match(/userSettingsFile.*?value="([^"]+)"/)
      userSettingsFile = settingsFileMatch ? settingsFileMatch[1] : ""
    }
    
    // 提取选中的测试类
    const runManagerMatch = content.match(/selected="JUnit\.([^"]+)"/)
    if (runManagerMatch) {
      selectedTestClass = runManagerMatch[1]
    }
    
    // 从 JUnit 配置中提取类名
    if (!selectedTestClass) {
      const junitMatch = content.match(/MAIN_CLASS_NAME value="([^"]+Test)"/)
      if (junitMatch) {
        selectedTestClass = junitMatch[1].split(".").pop()
      }
    }
  }
  
  // 查找并读取 jdk.table.xml
  const jdkTablePath = findJDKTablePath()
  let jdkPath = ""
  
  if (jdkTablePath && miscConfig.jdkName) {
    jdkPath = getJDKPathFromTable(jdkTablePath, miscConfig.jdkName) || ""
  }
  
  // 如果找不到 JDK 路径，尝试使用 JAVA_HOME
  if (!jdkPath) {
    jdkPath = process.env.JAVA_HOME || ""
  }
  
  // 如果找不到 Maven home，尝试使用系统 mvn
  if (!mavenHome) {
    // 尝试从 PATH 查找
    try {
      const { execSync } = require("child_process")
      const mvnPath = execSync("where mvn || which mvn", { encoding: "utf-8" }).trim().split("\n")[0]
      if (mvnPath) {
        // 从 bin/mvn 向上两级找到 maven home
        mavenHome = path.dirname(path.dirname(mvnPath))
      }
    } catch (e) {
      // 忽略错误
    }
  }
  
  return {
    projectPath,
    jdkName: miscConfig.jdkName,
    jdkPath,
    mavenHome,
    localRepository,
    userSettingsFile,
    selectedTestClass,
    languageLevel: miscConfig.languageLevel
  }
}

/**
 * 组装 mvn test 命令
 */
function buildMavenCommand(config: IDEAConfig, options: {
  testClass?: string
  skipTests?: boolean
  additionalArgs?: string[]
} = {}): string {
  const parts: string[] = []
  
  // 1. cd 到项目目录
  parts.push(`cd "${config.projectPath}"`)
  
  // 2. 设置 JAVA_HOME
  if (config.jdkPath) {
    if (process.platform === "win32") {
      parts.push(`set JAVA_HOME=${config.jdkPath}`)
    } else {
      parts.push(`export JAVA_HOME="${config.jdkPath}"`)
    }
  }
  
  // 3. 设置 MAVEN_OPTS
  const mavenOpts: string[] = []
  
  if (config.localRepository) {
    mavenOpts.push(`-Dmaven.repo.local="${config.localRepository}"`)
  }
  
  if (mavenOpts.length > 0) {
    if (process.platform === "win32") {
      parts.push(`set MAVEN_OPTS=${mavenOpts.join(" ")}`)
    } else {
      parts.push(`export MAVEN_OPTS="${mavenOpts.join(" ")}"`)
    }
  }
  
  // 4. mvn 命令
  const mvnCmd = config.mavenHome 
    ? path.join(config.mavenHome, "bin", process.platform === "win32" ? "mvn.cmd" : "mvn")
    : "mvn"
  
  const mvnArgs: string[] = []
  
  // settings.xml 文件 (必须在 mvn 命令中，不是 MAVEN_OPTS)
  if (config.userSettingsFile) {
    mvnArgs.push(`-s "${config.userSettingsFile}"`)
  }
  
  // 测试类
  const testClass = options.testClass || config.selectedTestClass
  if (testClass && !options.skipTests) {
    mvnArgs.push(`-Dtest=${testClass}`)
  }
  
  // 额外参数
  if (options.additionalArgs) {
    mvnArgs.push(...options.additionalArgs)
  }
  
  // 目标
  if (options.skipTests) {
    mvnArgs.push("install", "-DskipTests")
  } else {
    mvnArgs.push("test")
  }
  
  parts.push(`"${mvnCmd}" ${mvnArgs.join(" ")}`)
  
  // Windows 用 && 连接，Unix 用 ; 或换行
  if (process.platform === "win32") {
    return parts.join(" && ")
  } else {
    return parts.join(" && ")
  }
}

/**
 * 执行命令
 */
async function executeCommand(command: string): Promise<MavenResult> {
  const { exec } = require("child_process")
  const util = require("util")
  const execPromise = util.promisify(exec)
  
  try {
    const { stdout, stderr } = await execPromise(command, { 
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 10 // 10MB
    })
    
    return {
      success: true,
      command,
      output: stdout + (stderr ? "\n" + stderr : "")
    }
  } catch (error: any) {
    return {
      success: false,
      command,
      output: error.stdout,
      error: error.stderr || error.message,
      exitCode: error.code
    }
  }
}

/**
 * IDEA Maven 测试插件
 */
export const ideaMavenTestPlugin: Plugin = {
  name: "idea-maven-test",
  version: "1.0.0",
  description: "读取 IDEA 配置并执行 Maven 测试",
  
  tools: [
    tool({
      name: "idea-read-config",
      description: "读取 IntelliJ IDEA 项目配置（JDK、Maven、测试类等）",
      parameters: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "项目路径（包含 .idea 目录的路径）"
          }
        },
        required: ["projectPath"]
      }
    }, async ({ projectPath }) => {
      try {
        const config = await readIDEAConfig(projectPath)
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              config: {
                projectPath: config?.projectPath,
                jdkName: config?.jdkName,
                jdkPath: config?.jdkPath,
                mavenHome: config?.mavenHome,
                localRepository: config?.localRepository,
                userSettingsFile: config?.userSettingsFile,
                selectedTestClass: config?.selectedTestClass,
                languageLevel: config?.languageLevel
              }
            }, null, 2)
          }]
        }
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message
            }, null, 2)
          }]
        }
      }
    }),
    
    tool({
      name: "idea-build-test-command",
      description: "根据 IDEA 配置组装 mvn test 命令",
      parameters: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "项目路径"
          },
          testClass: {
            type: "string",
            description: "指定测试类（可选，默认读取 workspace.xml 中的选中配置）"
          },
          skipTests: {
            type: "boolean",
            description: "是否跳过测试（执行 install -DskipTests）"
          },
          additionalArgs: {
            type: "array",
            items: { type: "string" },
            description: "额外的 Maven 参数"
          }
        },
        required: ["projectPath"]
      }
    }, async ({ projectPath, testClass, skipTests, additionalArgs }) => {
      try {
        const config = await readIDEAConfig(projectPath)
        const command = buildMavenCommand(config!, {
          testClass,
          skipTests,
          additionalArgs
        })
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              command,
              config: {
                jdkName: config?.jdkName,
                jdkPath: config?.jdkPath,
                mavenHome: config?.mavenHome,
                selectedTestClass: config?.selectedTestClass
              }
            }, null, 2)
          }]
        }
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message
            }, null, 2)
          }]
        }
      }
    }),
    
    tool({
      name: "idea-run-test",
      description: "读取 IDEA 配置并执行 Maven 测试",
      parameters: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "项目路径"
          },
          testClass: {
            type: "string",
            description: "指定测试类（可选）"
          },
          dryRun: {
            type: "boolean",
            description: "是否只显示命令不执行"
          }
        },
        required: ["projectPath"]
      }
    }, async ({ projectPath, testClass, dryRun = false }) => {
      try {
        const config = await readIDEAConfig(projectPath)
        const command = buildMavenCommand(config!, { testClass })
        
        if (dryRun) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                dryRun: true,
                command,
                config: {
                  jdkName: config?.jdkName,
                  jdkPath: config?.jdkPath,
                  mavenHome: config?.mavenHome,
                  localRepository: config?.localRepository,
                  selectedTestClass: config?.selectedTestClass
                }
              }, null, 2)
            }]
          }
        }
        
        // 执行命令
        const result = await executeCommand(command)
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: result.success,
              command: result.command,
              exitCode: result.exitCode,
              output: result.output?.substring(0, 50000), // 限制输出长度
              error: result.error
            }, null, 2)
          }]
        }
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message
            }, null, 2)
          }]
        }
      }
    }),
    
    tool({
      name: "idea-list-test-classes",
      description: "列出项目中所有的测试类",
      parameters: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "项目路径"
          }
        },
        required: ["projectPath"]
      }
    }, async ({ projectPath }) => {
      const testDir = path.join(projectPath, "src", "test", "java")
      
      if (!fs.existsSync(testDir)) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: "未找到测试目录: src/test/java"
            }, null, 2)
          }]
        }
      }
      
      const testClasses: string[] = []
      
      function scanDir(dir: string, basePackage: string = "") {
        const items = fs.readdirSync(dir)
        
        for (const item of items) {
          const fullPath = path.join(dir, item)
          const stat = fs.statSync(fullPath)
          
          if (stat.isDirectory()) {
            scanDir(fullPath, basePackage ? `${basePackage}.${item}` : item)
          } else if (item.endsWith("Test.java")) {
            const className = item.replace(".java", "")
            testClasses.push(basePackage ? `${basePackage}.${className}` : className)
          }
        }
      }
      
      scanDir(testDir)
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            testClasses,
            count: testClasses.length
          }, null, 2)
        }]
      }
    })
  ]
}

export default ideaMavenTestPlugin
