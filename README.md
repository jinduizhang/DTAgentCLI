# DTAgent CLI

智能化的 Java 单元测试生成 CLI 工具，基于 OpenCode 构建。

## 文档

- [安装指南](./docs/installation.md)
- [使用场景说明](./docs/usage-scenarios.md)

## 特性

- 🚀 **快速初始化** - 一键检测项目框架，自动配置测试环境
- 🧪 **智能生成** - 自动生成 JUnit 5 单元测试
- 📝 **经验融入** - 自动匹配并应用项目特定的 Mock 经验
- 📊 **批量处理** - 支持目录扫描，批量生成测试
- 🔄 **MR 支持** - 基于 Git Diff 分析变更代码

## 快速开始

```bash
# 1. 初始化项目
dtagent init

# 2. 启动 OpenCode
opencode

# 3. 生成测试
/generate-dt-single src/main/java/service/OrderService.java
```

## 命令速查

### CLI 命令

| 命令 | 说明 |
|------|------|
| `dtagent init [file]` | 初始化项目配置 |
| `dtagent generate --file <path>` | 单文件测试生成 |
| `dtagent generate --dir <path>` | 批量测试生成 |
| `dtagent extract-experience --dir <path> --save` | 提取 Mock 经验 |

### OpenCode 斜杠命令

| 命令 | 说明 |
|------|------|
| `/init-dt` | 初始化项目 DT 配置 |
| `/generate-dt-single {file}` | 端到端单文件测试生成 |
| `/generate-dt-dir {dir}` | 批量端到端测试生成 |
| `/task-status-dt` | 查看批量任务进度 |
| `/mr-ut [--base BRANCH]` | MR 变更 UT 分析 |
| `/fix-ut {test}` | 修复失败的测试 |
| `/coverage [target]` | 分析测试覆盖率 |
| `/coverage-fill [--threshold N]` | 项目级覆盖率补齐 |
| `/extract-experience [target] --save` | 提取 Mock 经验 |

## 端到端流程

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  generate-java-ut   │ →  │    fix-java-ut      │ →  │   java-coverage     │
│     生成测试        │    │    修复测试         │    │   提升覆盖率        │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## 目录结构

```
DTAgentCLI/
├── bin/                    # CLI 入口
│   └── dtagent.js
├── src/                    # TypeScript 源码
│   ├── commands/           # 命令实现
│   │   ├── init.ts
│   │   ├── generate.ts
│   │   └── extract-experience.ts
│   └── utils/              # 工具函数
│       ├── detector.ts
│       └── report.ts
├── templates/              # 模板文件
│   ├── agents/             # OpenCode 代理
│   │   └── dtagent.md
│   ├── commands/           # OpenCode 斜杠命令
│   ├── plugins/            # OpenCode 插件
│   │   └── task-manager.ts
│   ├── skills/             # OpenCode 技能
│   │   ├── generate-java-ut/
│   │   ├── fix-java-ut/
│   │   ├── java-coverage/
│   │   └── init-dt/
│   └── iterations/         # 迭代历史
├── docs/                   # 文档
│   ├── installation.md     # 安装指南
│   └── usage-scenarios.md  # 使用场景
├── package.json
└── README.md
```

## 前置条件

- Node.js >= 18.0.0
- OpenCode CLI
- Java 项目（Maven 或 Gradle）

## 许可证

MIT