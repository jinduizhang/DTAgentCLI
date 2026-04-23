# DTAgentCLI OpenCode Plugin 适配设计

## 概述

本文档描述 DTAgentCLI 如何以最小改动适配 OpenCode Plugin 机制，实现：

1. **作为可 Tab 切换的 Primary Agent 注册** - 用户按 Tab 键可在 build/plan/dtagent 等 agent 间切换
2. **统一命令前缀支持** - 通过 `/dtagent:xxx` 格式访问所有能力
3. **自动发现机制** - 新增能力只需添加文件，无需改代码

**目标**: 
- 不改动现有 `templates/` 目录结构
- 新增 plugin 入口文件
- DTAgent 作为 Primary Agent，携带完整系统提示和工具限制
- 支持 `/dtagent:xxx` 格式的统一命令前缀

---

## 背景

### OpenCode Plugin 机制

OpenCode 支持通过 `plugin` 字段加载 npm 包：

```json
{
  "plugin": ["@dtagent/cli"]
}
```

Plugin 必须导出一个函数，返回 `Hooks` 对象，支持注册：
- **Tools**: 自定义工具
- **Commands**: 斜杠命令
- **Agents**: AI Agent 配置
- **Events**: 事件钩子

### 现有架构

DTAgentCLI 当前架构：

```
DTAgentCLI/
├── src/
│   └── commands/
│       └── init.ts         # CLI 入口，复制 templates 到 .opencode/
├── templates/
│   ├── agents/
│   │   └── dtagent.md      # Agent 定义
│   ├── commands/           # 斜杠命令
│   │   ├── init-dt.md
│   │   ├── fix-ut.md
│   │   └── ...
│   ├── skills/             # Skills
│   │   ├── generate-java-ut/
│   │   ├── fix-java-ut/
│   │   └── ...
│   └── plugins/            # TypeScript 插件
│       ├── task-manager.ts
│       ├── maven-tools.ts
│       └── ...
└── package.json
```

---

## 设计方案

### 核心思想

创建一个**通用注册中心**（Registry），自动发现并加载：
1. **内置 Commands** (`templates/commands/*.md`)
2. **内置 Skills** (`templates/skills/*/SKILL.md`)
3. **内置 Tools** (`templates/plugins/*.ts`)
4. **项目级扩展** (`.opencode/` 目录)

所有能力统一映射到 `/dtagent:xxx` 前缀。

### 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OpenCode 启动                                    │
│                                                                         │
│  读取 opencode.json:                                                    │
│  { "plugin": ["@dtagent/cli"] }                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     加载 DTAgent Plugin                                  │
│                                                                         │
│  入口: dist/plugin/index.js                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     创建 Registry                                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    DTAgentRegistry                               │   │
│  │                                                                  │   │
│  │  配置:                                                           │   │
│  │  - prefix: 'dtagent:'                                            │   │
│  │  - directory: 项目目录                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     registry.load()                                      │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  并行加载（4个 Loader）                                             │  │
│  │                                                                    │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                         │  │
│  │  │ command-loader  │  │ skill-loader    │                         │  │
│  │  │                 │  │                 │                         │  │
│  │  │ templates/      │  │ templates/      │                         │  │
│  │  │ commands/*.md   │  │ skills/*/       │                         │  │
│  │  │                 │  │ SKILL.md        │                         │  │
│  │  │                 │  │                 │                         │  │
│  │  │ 发现:           │  │ 发现:           │                         │  │
│  │  │ - init-dt       │  │ - generate-java │                         │  │
│  │  │ - fix-ut        │  │ -ut             │                         │  │
│  │  │ - generate-dt   │  │ - fix-java-ut   │                         │  │
│  │  │ -single         │  │ - java-coverage │                         │  │
│  │  │ - ...           │  │ - ...           │                         │  │
│  │  └─────────────────┘  └─────────────────┘                         │  │
│  │                                                                    │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                         │  │
│  │  │ tool-loader     │  │ project-loader  │                         │  │
│  │  │                 │  │                 │                         │  │
│  │  │ templates/      │  │ .opencode/      │                         │  │
│  │  │ plugins/*.ts    │  │ commands/       │                         │  │
│  │  │                 │  │ skills/         │                         │  │
│  │  │                 │  │ plugins/        │                         │  │
│  │  │ 发现:           │  │                 │                         │  │
│  │  │ - task-manager  │  │ 用户自定义扩展   │                         │  │
│  │  │ - maven-tools   │  │ (dtagent-xxx)   │                         │  │
│  │  │ - ...           │  │                 │                         │  │
│  │  └─────────────────┘  └─────────────────┘                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     返回 Hooks                                           │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  tool: {                                                         │    │
│  │    dtagent: ToolDefinition,  ← 统一入口                        │    │
│  │    task-manager: ToolDefinition,                               │    │
│  │    maven-tools: ToolDefinition,                                │    │
│  │    ...                                                          │    │
│  │  }                                                              │    │
│  │                                                                  │    │
│  │  config: async (config) => {                                    │    │
│  │    // 注入 dtagent agent                                        │    │
│  │    config.agent.dtagent = { ... }                               │    │
│  │                                                                  │    │
│  │    // 注入 commands                                              │    │
│  │    config.command["dtagent:init-dt"] = { ... }                  │    │
│  │    config.command["dtagent:fix-ut"] = { ... }                   │    │
│  │    ...                                                          │    │
│  │  }                                                              │    │
│  │                                                                  │    │
│  │  event: async ({ event }) => { ... }                            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 文件变更

### 完整文件改动清单

#### 新增文件（8个）

| 序号 | 文件路径 | 类型 | 说明 |
|------|---------|------|------|
| 1 | `src/plugin/index.ts` | 入口 | Plugin 主入口，导出 Plugin 函数给 OpenCode |
| 2 | `src/plugin/registry.ts` | 核心 | 通用注册中心，管理所有能力（commands/skills/tools） |
| 3 | `src/plugin/types.ts` | 类型 | TypeScript 类型定义（DTAgentCapability, RegistryConfig 等） |
| 4 | `src/plugin/loaders/command-loader.ts` | 加载器 | 加载 templates/commands/*.md 文件 |
| 5 | `src/plugin/loaders/skill-loader.ts` | 加载器 | 加载 templates/skills/*/SKILL.md 文件 |
| 6 | `src/plugin/loaders/tool-loader.ts` | 加载器 | 加载 templates/plugins/*.ts 文件 |
| 7 | `src/plugin/loaders/project-loader.ts` | 加载器 | 加载 .opencode/ 目录下的用户扩展 |
| 8 | `src/plugin/utils/frontmatter.ts` | 工具 | YAML frontmatter 解析器 |

#### 修改文件（1个）

| 文件路径 | 修改类型 | 具体修改内容 |
|---------|---------|-------------|
| `package.json` | 新增字段 | 1. 添加 `exports` 字段，暴露 `./plugin` 入口<br>2. 添加依赖：`@opencode-ai/plugin@^1.4.0`<br>3. 添加依赖：`@opencode-ai/sdk@^1.4.0` |

#### 不修改的文件（保持原样）

| 目录/文件 | 说明 |
|----------|------|
| `bin/dtagent.js` | CLI 入口，保持不变 |
| `src/commands/init.ts` | init 命令实现，保持不变 |
| `src/commands/generate.ts` | generate 命令实现，保持不变 |
| `src/utils/` | 所有工具函数，保持不变 |
| `templates/agents/dtagent.md` | Agent 定义模板，保持不变 |
| `templates/commands/*.md` | 所有 command 模板，保持不变 |
| `templates/skills/*/` | 所有 skill 模板，保持不变 |
| `templates/plugins/*.ts` | 所有 plugin 模板，保持不变 |
| `README.md` | 项目文档，保持不变 |
| `.gitignore` | 保持不变 |

### 目录结构对比

#### 修改前

```
DTAgentCLI/
├── bin/
│   └── dtagent.js
├── src/
│   ├── commands/
│   │   ├── init.ts
│   │   └── ...
│   └── utils/
│       └── ...
├── templates/
│   ├── agents/
│   ├── commands/
│   ├── skills/
│   └── plugins/
└── package.json
```

#### 修改后

```
DTAgentCLI/
├── bin/
│   └── dtagent.js              # 不变
├── src/
│   ├── commands/
│   │   ├── init.ts             # 不变
│   │   └── ...                 # 不变
│   ├── plugin/                 # 【新增】
│   │   ├── index.ts            # 【新增】Plugin 入口
│   │   ├── registry.ts         # 【新增】注册中心
│   │   ├── types.ts            # 【新增】类型定义
│   │   ├── loaders/            # 【新增】
│   │   │   ├── command-loader.ts
│   │   │   ├── skill-loader.ts
│   │   │   ├── tool-loader.ts
│   │   │   └── project-loader.ts
│   │   └── utils/
│   │       └── frontmatter.ts  # 【新增】
│   └── utils/                  # 不变
├── templates/                  # 不变
│   ├── agents/
│   ├── commands/
│   ├── skills/
│   └── plugins/
├── package.json                # 【修改】添加 exports 和依赖
└── ...
```
- `src/commands/init.ts`
- `bin/dtagent.js`

---

## 数据流

### Agent 切换流程（Tab 键）

```
用户按 Tab 键
        │
        ▼
┌───────────────────────┐
│ OpenCode 切换 Agent   │
│ build → plan → dtagent│
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│ 加载 dtagent Agent    │
│ 配置:                 │
│ - mode: "primary"     │
│ - prompt: dtagent.md  │
│ - tools: 受限工具集   │
│ - rules: 文件路径限制 │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│ 系统提示注入          │
│ "你是 DTAgent，专注   │
│ Java 单元测试..."     │
│ "禁止修改 src/main/   │
│ java/ 下的代码"       │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│ 用户与 DTAgent 对话   │
│ AI 自动遵循限制       │
└───────────────────────┘
```

### 工具权限控制

```typescript
// Agent 配置中的工具限制
config.agent.dtagent = {
  mode: "primary",
  tools: {
    // 允许的操作
    read: true,
    grep: true,
    glob: true,
    
    // 文件操作（带路径检查）
    write: {
      allowed: true,
      // 路径检查：只允许 src/test/java/
      pathValidator: (path) => path.includes('src/test/java/')
    },
    edit: {
      allowed: true,
      pathValidator: (path) => path.includes('src/test/java/')
    },
    
    // 禁止的操作
    lsp_rename: false,
    ast_grep_replace: false,
  }
}
```

### Command 调用流程（通过 /dtagent:xxx）

```
用户输入: /dtagent:fix-java-ut OrderServiceTest
                │
                ▼
        ┌───────────────┐
        │ OpenCode 识别  │
        │ /dtagent:xxx  │
        └───────────────┘
                │
                ▼
        ┌───────────────┐
        │ 调用 dtagent  │
        │ tool          │
        └───────────────┘
                │
                ▼
        ┌───────────────────┐
        │ registry.execute  │
        │ ("fix-java-ut")   │
        └───────────────────┘
                │
                ▼
        ┌───────────────────┐
        │ registry.find()   │
        │ 查找能力          │
        └───────────────────┘
                │
                ▼
        ┌───────────────────────────┐
        │ 返回 DTAgentCapability    │
        │ {                         │
        │   type: 'skill',          │
        │   name: 'fix-java-ut',    │
        │   content: SKILL.md 内容 │
        │ }                         │
        └───────────────────────────┘
                │
                ▼
        ┌───────────────────┐
        │ 格式化输出         │
        │ 添加 header + body │
        └───────────────────┘
                │
                ▼
        ┌───────────────────┐
        │ 返回给 AI          │
        │ AI 按内容执行       │
        └───────────────────┘
```

### Skill 内容结构

```
## SKILL: dtagent:fix-java-ut

**Source**: builtin
**Base directory**: /path/to/project

[SKILL.md 原始内容]

---

## 经验库

[自动加载 experiences/*.md 内容]
```

---

## 扩展机制

### 内置扩展（开发者）

```
新增 Command:
  templates/commands/new-feature.md
  
  ---
  description: 新功能描述
  ---
  
  # 新功能
  ...

新增 Skill:
  templates/skills/new-feature/SKILL.md
  
  ---
  name: new-feature
  description: 新技能描述
  ---
  
  ## 功能
  ...

新增 Tool:
  templates/plugins/new-tool.ts
  
  export const NewTool = tool({
    description: "新工具",
    args: { ... },
    execute: async (...) => { ... }
  })
```

**自动发现，无需改代码**

用户使用: `/dtagent:new-feature`

### 用户扩展（项目级）

```
项目级 Command:
  .opencode/commands/dtagent-my-command.md

项目级 Skill:
  .opencode/skills/dtagent-my-skill/SKILL.md

项目级 Tool:
  .opencode/plugins/dtagent-my-tool.ts
```

**项目级自动发现**

用户使用: `/dtagent:my-command`

---

## API 设计

### DTAgentRegistry

```typescript
class DTAgentRegistry {
  constructor(config: RegistryConfig)
  
  // 加载所有能力
  load(): RegistryResult
  
  // 查找能力（支持多种格式）
  find(name: string): DTAgentCapability | undefined
  
  // 执行能力
  execute(name: string, args: any, context: any): Promise<string>
  
  // 获取帮助信息
  getHelp(): string
  
  // 清除缓存
  clearCache(): void
}
```

### Agent 配置接口

```typescript
interface AgentConfig {
  mode: "primary" | "subagent"  // 必须 primary 才能 Tab 切换
  description: string
  model?: string                 // 可配置模型
  prompt: string               // 系统提示（来自 dtagent.md）
  
  // 工具权限
  tools?: {
    [toolName: string]: boolean | {
      allowed: boolean
      pathValidator?: (path: string) => boolean
    }
  }
  
  // 规则提示（注入到系统提示）
  rules?: string[]
}
```

### 能力类型

```typescript
interface DTAgentCapability {
  type: 'command' | 'skill' | 'tool'
  name: string
  displayName: string  // e.g., 'dtagent:fix-java-ut'
  description: string
  source: 'builtin' | 'project' | 'user'
  content?: string           // for command/skill
  definition?: ToolDefinition // for tool
}
```

---

## 使用方式

### 1. Agent 切换（Tab 键）

安装插件后，按 **Tab** 键在 agents 间循环：

```
build → plan → dtagent → build → ...
```

切换到 **dtagent** 后：
- 系统提示自动注入 DTAgent 的规则（禁止修改业务代码等）
- AI 自动遵循限制
- 可以直接对话："为 OrderService 生成测试"

### 2. 全局安装

```json
// ~/.config/opencode/opencode.json
{
  "plugin": ["@dtagent/cli"]
}
```

### 3. 项目级安装

```json
// 项目根目录 opencode.json
{
  "plugin": ["@dtagent/cli@0.1.0"]
}
```

### 4. 斜杠命令调用

在任意 agent 下，使用 `/dtagent:xxx` 调用 DTAgent 能力：

```
# 初始化项目
/dtagent:init-dt --decompile com.alibaba.*

# 生成测试
/dtagent:generate-dt-single src/main/java/service/OrderService.java

# 修复测试
/dtagent:fix-java-ut OrderServiceTest

# 覆盖率分析
/dtagent:java-coverage
```

### 5. 配置默认 Agent（可选）

```json
// opencode.json
{
  "default_agent": "dtagent"
}
```

---

## 依赖项

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.4.0",
    "@opencode-ai/sdk": "^1.4.0",
    // ... 原有依赖
  }
}
```

---

## 风险与考虑

| 风险 | 缓解措施 |
|------|---------|
| 路径解析失败 | 提供多个 fallback 路径 |
| YAML 解析错误 | 使用简单的正则解析，容错处理 |
| 工具动态加载失败 | 提供占位定义，不中断流程 |
| 缓存失效 | 提供 clearCache() 方法 |

---

## 验收标准

- [ ] 通过 `opencode.json` 中的 `plugin` 字段加载 DTAgent
- [ ] 支持 `/dtagent:xxx` 格式的统一前缀
- [ ] 所有内置 commands 可通过 `/dtagent:command-name` 访问
- [ ] 所有内置 skills 可通过 `/dtagent:skill-name` 访问
- [ ] 支持项目级扩展（.opencode/ 目录）
- [ ] 后续新增能力只需添加文件，无需改代码
- [ ] 不影响原有 CLI 功能（`dtagent init` 等）

---

## 附录

### 目录结构（完整）

```
DTAgentCLI/
├── bin/
│   └── dtagent.js              # CLI 入口（不变）
├── src/
│   ├── commands/
│   │   ├── init.ts             # init 命令（不变）
│   │   └── ...                 # 其他命令（不变）
│   ├── plugin/                 # 新增
│   │   ├── index.ts            # Plugin 入口
│   │   ├── registry.ts         # 注册中心
│   │   ├── types.ts            # 类型定义
│   │   ├── loaders/
│   │   │   ├── command-loader.ts
│   │   │   ├── skill-loader.ts
│   │   │   ├── tool-loader.ts
│   │   │   └── project-loader.ts
│   │   └── utils/
│   │       └── frontmatter.ts
│   └── utils/                  # 原有工具（不变）
├── templates/                  # 原有模板（不变）
│   ├── agents/
│   ├── commands/
│   ├── skills/
│   └── plugins/
├── package.json                # 需修改
└── ...
```

### package.json 修改

```diff
  {
    "name": "@dtagent/cli",
    "version": "0.1.0",
    "main": "dist/index.js",
+   "exports": {
+     ".": {
+       "types": "./dist/index.d.ts",
+       "require": "./dist/index.js"
+     },
+     "./plugin": {
+       "types": "./dist/plugin/index.d.ts",
+       "require": "./dist/plugin/index.js"
+     }
+   },
    "bin": {
      "dtagent": "./bin/dtagent.js"
    },
    "dependencies": {
+     "@opencode-ai/plugin": "^1.4.0",
+     "@opencode-ai/sdk": "^1.4.0",
      "async-lock": "^1.4.1",
      ...
    }
  }
```
