---
description: Maven Test 命令实现 - 读取 IDEA 配置并执行测试
---

# /mvn-test 命令实现

## 触发条件

用户输入 `/mvn-test` 或 `/mvn-test [testClass]` 时触发。

## 执行流程

### 1. 读取 IDEA 配置

**读取 `.idea/misc.xml`：**
- 提取 `project-jdk-name`（JDK 名称，如 `21`）
- 提取 `languageLevel`（如 `JDK_25`）

**读取 `.idea/workspace.xml`：**
- 查找 `MavenImportPreferences` 组件
- 提取 `customMavenHome`（Maven 路径）
- 提取 `localRepository`（本地仓库）
- 提取 `userSettingsFile`（settings.xml）
- 提取 `RunManager` 中选中的测试类

**读取 IDEA 系统 `jdk.table.xml`：**
- 根据 JDK 名称查找实际安装路径
- 路径：`~/AppData/Roaming/JetBrains/IntelliJIdea*/options/jdk.table.xml`

### 2. 组装命令

**Windows 格式：**
```batch
cd "项目目录" && 
set JAVA_HOME=JDK路径 && 
set MAVEN_OPTS=-Dmaven.repo.local="本地仓库路径" && 
"Maven/bin/mvn.cmd" -s "settings.xml路径" -Dtest=测试类 test
```

**Unix 格式：**
```bash
cd "项目目录" && 
export JAVA_HOME="JDK路径" && 
export MAVEN_OPTS="-Dmaven.repo.local=本地仓库路径" && 
"Maven/bin/mvn" -s "settings.xml路径" -Dtest=测试类 test
```

### 3. 执行命令

使用 `bash` 或 `exec` 执行组装好的命令。

## 代码实现

```typescript
import { bash, read, grep } from "@opencode-ai/core"
import * as path from "path"
import * as fs from "fs"

interface MavenTestOptions {
  testClass?: string
  dryRun?: boolean
}

export async function executeMavenTest(projectPath: string, options: MavenTestOptions = {}) {
  // 1. 读取 misc.xml
  const miscContent = await read(`${projectPath}/.idea/misc.xml`)
  const jdkName = miscContent.match(/project-jdk-name="([^"]+)"/)?.[1]
  const languageLevel = miscContent.match(/languageLevel="JDK_([^"]+)"/)?.[1]
  
  // 2. 读取 workspace.xml
  const workspaceContent = await read(`${projectPath}/.idea/workspace.xml`)
  
  // 提取 Maven 配置
  const mavenSection = workspaceContent.match(
    /<component name="MavenImportPreferences">[\s\S]*?<\/component>/
  )?.[0] || ""
  
  const mavenHome = mavenSection.match(/customMavenHome.*?value="([^"]+)"/)?.[1] || ""
  const localRepository = mavenSection.match(/localRepository.*?value="([^"]+)"/)?.[1] || ""
  const userSettingsFile = mavenSection.match(/userSettingsFile.*?value="([^"]+)"/)?.[1] || ""
  
  // 提取选中的测试类
  let selectedTestClass = workspaceContent.match(/selected="JUnit\.([^"]+)"/)?.[1]
  if (!selectedTestClass) {
    selectedTestClass = workspaceContent.match(/MAIN_CLASS_NAME value="[^"]+\.([^"]+Test)"/)?.[1]
  }
  
  // 3. 读取 jdk.table.xml 获取 JDK 路径
  const jdkTablePath = findJDKTablePath()
  let jdkPath = ""
  if (jdkTablePath && jdkName) {
    const jdkTableContent = fs.readFileSync(jdkTablePath, "utf-8")
    const jdkRegex = new RegExp(
      `<jdk[^>]*>[^]*?<name value="${jdkName}"[^>]*/>[^]*?<homePath value="([^"]+)"`,
      'i'
    )
    const match = jdkTableContent.match(jdkRegex)
    jdkPath = match?.[1] || process.env.JAVA_HOME || ""
  }
  
  // 4. 组装命令
  const testClass = options.testClass || selectedTestClass
  const command = buildMavenCommand({
    projectPath,
    jdkPath,
    mavenHome,
    localRepository,
    userSettingsFile,
    testClass
  })
  
  // 5. 输出或执行
  if (options.dryRun) {
    return { command, config: { jdkName, jdkPath, mavenHome, testClass } }
  }
  
  const result = await bash({ command, description: "Execute Maven test" })
  return { command, result }
}

function buildMavenCommand(config: {
  projectPath: string
  jdkPath: string
  mavenHome: string
  localRepository: string
  userSettingsFile: string
  testClass?: string
}): string {
  const parts: string[] = []
  
  // cd 到项目目录
  parts.push(`cd "${config.projectPath}"`)
  
  // 设置 JAVA_HOME
  if (process.platform === "win32") {
    parts.push(`set JAVA_HOME=${config.jdkPath}`)
  } else {
    parts.push(`export JAVA_HOME="${config.jdkPath}"`)
  }
  
  // 设置 MAVEN_OPTS
  const mavenOpts = config.localRepository 
    ? `-Dmaven.repo.local="${config.localRepository}"`
    : ""
  if (mavenOpts) {
    if (process.platform === "win32") {
      parts.push(`set MAVEN_OPTS=${mavenOpts}`)
    } else {
      parts.push(`export MAVEN_OPTS="${mavenOpts}"`)
    }
  }
  
  // mvn 命令
  const mvnCmd = config.mavenHome
    ? path.join(config.mavenHome, "bin", process.platform === "win32" ? "mvn.cmd" : "mvn")
    : "mvn"
  
  const mvnArgs: string[] = []
  
  if (config.userSettingsFile) {
    mvnArgs.push(`-s "${config.userSettingsFile}"`)
  }
  
  if (config.testClass) {
    mvnArgs.push(`-Dtest=${config.testClass}`)
  }
  
  mvnArgs.push("test")
  
  parts.push(`"${mvnCmd}" ${mvnArgs.join(" ")}`)
  
  return parts.join(" && ")
}

function findJDKTablePath(): string | null {
  const homeDir = process.env.USERPROFILE || process.env.HOME || ""
  const basePaths = [
    path.join(homeDir, "AppData", "Roaming", "JetBrains"),
    path.join(homeDir, "Library", "Application Support", "JetBrains"),
    path.join(homeDir, ".config", "JetBrains")
  ]
  
  for (const basePath of basePaths) {
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
```

## 使用示例

### 基础用法

```
用户: /mvn-test

系统:
[INFO] 读取 IDEA 配置...
[INFO] JDK: 21 (Amazon Corretto)
[INFO] Maven: 3.9.13
[INFO] 本地仓库: D:\00_code\repository
[INFO] 选中测试类: DiffCalculatorTest

========== 生成的命令 ==========
cd "D:/OpenCode/config-history" && 
set JAVA_HOME=C:/Program Files/Amazon Corretto/jdk21.0.10_7 && 
set MAVEN_OPTS=-Dmaven.repo.local="D:\00_code\repository" && 
"D:\apache-maven-3.9.13\bin\mvn.cmd" -s "D:\apache-maven-3.9.13\conf\settings.xml" 
-Dtest=DiffCalculatorTest test
================================

[INFO] 执行测试...
[OUTPUT]
...
```

### 指定测试类

```
用户: /mvn-test HistoryAspectTest

系统:
[INFO] 读取 IDEA 配置...
[INFO] 使用指定测试类: HistoryAspectTest
...
```

### 预览模式

```
用户: /mvn-test --dry-run

系统:
========== 预览命令 ==========
cd "D:/OpenCode/config-history" && 
set JAVA_HOME=C:/Program Files/Amazon Corretto/jdk21.0.10_7 && 
set MAVEN_OPTS=-Dmaven.repo.local="D:\00_code\repository" && 
"D:\apache-maven-3.9.13\bin\mvn.cmd" -s "D:\apache-maven-3.9.13\conf\settings.xml" test
================================
[DRY RUN] 命令已生成，但未执行
```

## 与 init-dt 的协作

init-dt 初始化时会提取 Maven 配置并保存到 `DT_AGENTS.md`：

```markdown
## Maven 配置

JDK: 21
Maven: 3.9.13
本地仓库: D:\00_code\repository
Settings: D:\apache-maven-3.9.13\conf\settings.xml

## 快速命令

```bash
# 运行测试
mvn test -s D:\apache-maven-3.9.13\conf\settings.xml
```
```

mvn-test 命令直接读取这些配置并执行，无需手动复制。

## 错误处理

### 找不到 .idea 目录

```
错误: 不是 IntelliJ IDEA 项目（找不到 .idea 目录）
提示: 请先在 IDEA 中打开项目，或执行 /init-dt 初始化
```

### 找不到 JDK

```
错误: 无法从 IDEA 配置中找到 JDK 路径
提示: 检查 IDEA 的 Project Structure 设置
```

### 找不到 Maven

```
错误: 无法找到 Maven 配置
提示: 检查 IDEA 的 Maven 设置，或确保 mvn 在 PATH 中
```

### 测试类不存在

```
错误: 测试类 DiffCalculatorTest 不存在
提示: 可用的测试类:
  - HistoryAspectTest
  - ConfigServiceTest
  ...
```
