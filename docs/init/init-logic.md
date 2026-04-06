# DTAgent 初始化逻辑

## 概述

`dtagent init` 命令用于在 Java 项目中初始化 DTAgent 配置，自动检测项目框架、提取配置、安装组件。

---

## 初始化流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        dtagent init                             │
│                      主入口: initCommand                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: 参数解析                                               │
│  - 解析 --m2-repo (Maven 仓库路径)                              │
│  - 解析 --decompile (反编译包范围)                              │
│  - 解析 --force (强制覆盖)                                      │
│  - 解析 --file (指定 pom.xml/build.gradle)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: 项目框架检测                                           │
│  函数: detectFramework()                                        │
│                                                                 │
│  检测逻辑:                                                      │
│  1. 查找 pom.xml → MAVEN 项目                                   │
│  2. 查找 build.gradle → GRADLE 项目                            │
│  3. 都找不到 → unknown (退出)                                   │
│                                                                 │
│  提取信息:                                                      │
│  - 项目类型 (MAVEN/GRADLE)                                      │
│  - Spring Boot 版本                                             │
│  - JUnit 版本                                                   │
│  - Mockito 版本                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: 安装组件                                               │
│  函数: installComponents()                                      │
│                                                                 │
│  创建目录结构:                                                  │
│  .opencode/                                                     │
│   ├── agents/          → dtagent.md                             │
│   ├── commands/        → 斜杠命令                               │
│   ├── core/            → 核心模块 (已移除)                      │
│   ├── plugins/         → 插件                                    │
│   │   ├── task-manager.ts                                       │
│   │   ├── workspace-manager.ts                                  │
│   │   ├── maven-tools.ts                                        │
│   │   ├── telemetry.ts                                          │
│   │   └── idea-maven-test.ts                                    │
│   ├── skills/          → 技能                                    │
│   │   ├── generate-java-ut/                                     │
│   │   ├── fix-java-ut/                                          │
│   │   ├── java-coverage/                                        │
│   │   └── init-dt/                                              │
│   └── package.json                                              │
│                                                                 │
│  复制文件:                                                      │
│  - templates/agents/* → .opencode/agents/                       │
│  - templates/commands/* → .opencode/commands/                   │
│  - templates/plugins/*.ts → .opencode/plugins/                  │
│  - templates/skills/* → .opencode/skills/                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: 提取 Mock 经验                                         │
│  函数: extractExperiences()                                     │
│                                                                 │
│  扫描目录: src/test/java                                        │
│                                                                 │
│  提取模式:                                                      │
│  - @Mock/@MockBean 注解                                         │
│  - when().thenReturn() 模式                                     │
│                                                                 │
│  保存位置: .opencode/skills/generate-java-ut/experiences/       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 5: 反编译二方件 (可选)                                    │
│  函数: decompileInternalDependencies()                          │
│                                                                 │
│  触发条件: 指定了 --decompile 参数                              │
│                                                                 │
│  流程:                                                          │
│  1. 扫描 Maven 本地仓库                                         │
│  2. 匹配指定的包范围 (如 com.alibaba.*)                         │
│  3. 使用 CFR 反编译 jar 包                                      │
│  4. 生成索引文件 .dtagent/deps/index.json                       │
│                                                                 │
│  输出: .dtagent/deps/                                           │
│   ├── index.json           (类名 → 文件映射)                    │
│   └── {jar-name}/                                               │
│       └── {package}/                                            │
│           └── {Class}.java                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 6: 生成配置文件                                           │
│                                                                 │
│  6.1 生成 DT_AGENTS.md                                          │
│  函数: generateConfig()                                         │
│                                                                 │
│  内容包含:                                                      │
│  - 项目信息 (框架、版本)                                        │
│  - Maven 命令模板                                               │
│  - 二方件信息 (如果存在)                                        │
│  - 测试规范                                                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  6.2 生成 .dtagent/config.json                                  │
│  函数: generateDtagentConfig()                                  │
│                                                                 │
│  配置来源 (优先级从高到低):                                     │
│                                                                 │
│  1. IDEA workspace.xml (最高优先级)                             │
│     - localRepository → maven.repoPath                          │
│     - userSettingsFile → maven.settings                         │
│     - myProfiles → maven.profiles                              │
│     - myVmOptions → maven.jvmArgs                              │
│                                                                 │
│  2. 命令行参数 --m2-repo                                       │
│     → maven.repoPath                                            │
│                                                                 │
│  3. 默认值 (最低优先级)                                         │
│     - timeout: 300000 (5分钟)                                   │
│                                                                 │
│  最终输出:                                                      │
│  .dtagent/config.json                                           │
│  {                                                              │
│    "maven": {                                                   │
│      "repoPath": "D:/00_code/repository",                       │
│      "settings": "",                                            │
│      "profiles": "",                                            │
│      "jvmArgs": "",                                             │
│      "timeout": 300000                                          │
│    }                                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 7: 生成 opencode.json                                     │
│  函数: createOpenCodeConfig()                                   │
│                                                                 │
│  配置默认代理: dtagent                                          │
│                                                                 │
│  添加到 .gitignore: opencode.json                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ✅ 初始化完成                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Maven 配置提取详解

### 数据来源

#### 1. IDEA workspace.xml (最高优先级)

路径: `.idea/workspace.xml`

```xml
<component name="MavenImportPreferences">
  <option name="generalSettings">
    <MavenGeneralSettings>
      <option name="localRepository" value="D:\00_code\repository" />
      <option name="userSettingsFile" value="D:\apache-maven-3.9.13\conf\settings.xml" />
    </MavenGeneralSettings>
  </option>
</component>
```

提取字段:
- `localRepository` → `maven.repoPath`
- `userSettingsFile` → `maven.settings`

#### 2. 命令行参数

```bash
dtagent init --m2-repo "D:/00_code/repository"
```

#### 3. 默认值

```json
{
  "maven": {
    "timeout": 300000
  }
}
```

---

## 配置优先级

```
┌─────────────────────────────────────────────────────────────┐
│                      配置优先级栈                            │
├─────────────────────────────────────────────────────────────┤
│  Level 1 (最高)                                             │
│  ├── .idea/workspace.xml                                    │
│  │   ├── localRepository → repoPath                         │
│  │   ├── userSettingsFile → settings                       │
│  │   ├── myProfiles → profiles                              │
│  │   └── myVmOptions → jvmArgs                              │
│  │                                                          │
│  Level 2                                                    │
│  └── --m2-repo 参数 → repoPath                              │
│                                                             │
│  Level 3 (默认)                                             │
│  └── timeout: 300000                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 关键函数说明

| 函数 | 文件 | 职责 |
|------|------|------|
| `initCommand` | `src/commands/init.ts` | 主入口，协调初始化流程 |
| `detectFramework` | `src/utils/detector.ts` | 检测项目框架类型 |
| `installComponents` | `src/commands/init.ts` | 安装组件到 .opencode/ |
| `extractExperiences` | `src/commands/init.ts` | 提取 Mock 经验 |
| `decompileInternalDependencies` | `src/commands/init.ts` | 反编译二方件 |
| `generateConfig` | `src/commands/init.ts` | 生成 DT_AGENTS.md |
| `generateDtagentConfig` | `src/commands/init.ts` | 生成 .dtagent/config.json |
| `extractMavenConfig` | `src/commands/init.ts` | 从 IDEA 提取 Maven 配置 |
| `createOpenCodeConfig` | `src/commands/init.ts` | 生成 opencode.json |

---

## 目录结构

初始化完成后:

```
project-root/
├── .opencode/                      # OpenCode 配置目录
│   ├── agents/
│   │   └── dtagent.md             # DTAgent 代理配置
│   ├── commands/                   # 斜杠命令
│   │   ├── coverage.md
│   │   ├── coverage-fill.md
│   │   ├── diff-ut.md
│   │   ├── extract-experience.md
│   │   ├── fix-ut.md
│   │   ├── generate-dt-dir.md
│   │   ├── generate-dt-single.md
│   │   ├── init-dt.md
│   │   ├── mr-ut.md
│   │   ├── mvn-test.md
│   │   ├── mvn-test-impl.md
│   │   ├── plan-dt.md
│   │   └── task-status-dt.md
│   ├── plugins/                    # 插件
│   │   ├── idea-maven-test.ts
│   │   ├── maven-tools.ts         # Maven 工具 (compile/test/coverage)
│   │   ├── task-manager.ts        # 任务队列管理
│   │   ├── telemetry.ts           # 遥测上报
│   │   └── workspace-manager.ts   # 工作空间管理
│   ├── skills/                     # 技能
│   │   ├── fix-java-ut/
│   │   ├── generate-java-ut/
│   │   ├── init-dt/
│   │   └── java-coverage/
│   ├── package.json
│   └── ...
│
├── .dtagent/                       # DTAgent 配置目录
│   ├── config.json                # Maven 配置
│   │   {
│   │     "maven": {
│   │       "repoPath": "D:/00_code/repository",
│   │       "settings": "",
│   │       "profiles": "",
│   │       "jvmArgs": "",
│   │       "timeout": 300000
│   │     }
│   │   }
│   │
│   ├── deps/                       # 二方件反编译结果
│   │   ├── index.json
│   │   └── {jar-name}/
│   ├── logs/                       # 日志
│   └── reports/                    # 报告
│
├── DT_AGENTS.md                    # DTAgent 配置文档
├── opencode.json                   # OpenCode 配置
└── ...
```

---

## 使用示例

### 基础初始化

```bash
cd /path/to/project
dtagent init
```

### 指定 Maven 仓库

```bash
dtagent init --m2-repo "D:/00_code/repository"
```

### 反编译二方件

```bash
dtagent init --decompile "com.alibaba.*,com.taobao.*" --m2-repo "D:/00_code/repository"
```

### 强制重新初始化

```bash
dtagent init --force
```

---

## 配置说明

### .dtagent/config.json

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| `maven.repoPath` | string | Maven 本地仓库路径 | IDEA / --m2-repo |
| `maven.settings` | string | Maven settings.xml 路径 | IDEA |
| `maven.profiles` | string | 激活的 Maven profiles | IDEA |
| `maven.jvmArgs` | string | JVM 参数 | IDEA |
| `maven.timeout` | number | 命令超时时间(ms) | 默认值 300000 |

---

## 相关文档

- [安装指南](../installation.md)
- [使用场景](../usage-scenarios.md)
- [Maven 工具使用](../maven-tools.md)
