# DTAgent CLI

智能化的 Java 单元测试生成 CLI 工具，基于 OpenCode 构建。

## 文档

- [安装指南](./docs/installation.md)
- [使用场景说明](./docs/usage-scenarios.md)

## 特性

- 🚀 **快速初始化** - 一键检测项目框架，自动配置测试环境
- 🧪 **智能生成** - 自动生成 JUnit 5 单元测试
- 📝 **经验融入** - 自动匹配并应用项目特定的 Mock 经验
- 🔧 **二方件精准 Mock** - 使用 CFR 反编译获取 API 签名，生成精准 Mock
- 📊 **批量处理** - 支持目录扫描，批量生成测试
- 🔄 **MR 支持** - 基于 Git Diff 分析变更代码
- 🔒 **并发安全** - 使用 async-lock 实现 Maven 测试互斥，确保编译隔离

## 快速开始

```bash
# 1. 初始化项目（推荐：指定二方件反编译范围）
dtagent init --decompile com.huawei.* --m2-repo D:/00_code/repository

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
| `dtagent init --decompile <packages>` | 初始化 + 反编译二方件 |
| `dtagent init --m2-repo <path>` | 指定 Maven 本地仓库路径 |
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
| `/mr-ut [--base BRANCH]` | MR 变更 UT 分析（已提交 MR） |
| `/diff-ut [--base BRANCH]` | 本地变更 UT 分析（提交前） |
| `/fix-ut {target}` | 修复失败的测试（单类/批量） |
| `/coverage [target]` | 分析测试覆盖率 |
| `/coverage-fill [--threshold N]` | 项目级覆盖率补齐 |
| `/extract-experience [target] --save` | 提取 Mock 经验 |

## 二方件精准 Mock

### 问题背景

二方件（公司内部依赖）没有公开文档，Mock 时方法签名容易写错，导致测试失败。

### 解决方案

使用 CFR 反编译工具，从 jar 包中提取完整的 API 签名信息。

### 使用方式

```bash
# 初始化时指定反编译范围
dtagent init --decompile com.alibaba.*,com.taobao.* --m2-repo D:/00_code/repository
```

### 反编译结果

```
.dtagent/
├── deps/
│   ├── index.json                    # 类名 → 文件映射
│   ├── fastjson-2.0.43/
│   │   └── com/alibaba/fastjson/
│   │       └── JSON.java             # 反编译文件
│   └── ...
```

### 二方件识别规则

| 包名前缀 | 类型 | 处理方式 |
|---------|------|---------|
| `java.*`, `javax.*` | 标准库 | 直接使用 |
| `org.springframework.*` | 框架 | 有文档 |
| `org.apache.*`, `com.google.*` | 开源库 | 有文档 |
| `com.alibaba.*`, `com.taobao.*` | 二方件 | 使用反编译 |

## 端到端流程

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  generate-java-ut   │ →  │    fix-java-ut      │ →  │   java-coverage     │
│     生成测试        │    │    修复测试         │    │   提升覆盖率        │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
        │
        ▼
  识别二方件依赖
        │
        ▼
  查找反编译文件 (.dtagent/deps/)
        │
        ▼
  提取方法签名 → 生成精准 Mock
```

## 并发安全机制

### 问题背景

批量测试生成时，多个 Session 并发执行 Maven 编译，会导致 target 目录和 .m2 缓存冲突。

### 解决方案

使用 **async-lock** 全局互斥锁，确保 Maven 测试串行执行。

```
并发模型:
├── Session 思考：并发执行（batchSize 控制）
├── mvn test：串行执行（async-lock 互斥）
└── 资源共享：单一 .m2 缓存，单一工作空间

关键特性:
├── ✅ 实现简单：一行代码搞定互斥
├── ✅ 资源高效：共享缓存，节省空间
├── ✅ 自动恢复：进程崩溃，锁自动释放
└── ⚠️ 测试串行：吞吐量受限于单线程
```

### batchSize 参数说明

`batchSize` 控制并发 Session 数量：

- `batchSize=1`: 单 Session 执行，无并发
- `batchSize>1`: 多 Session 并发思考，但 `mvn test` 串行执行

**注意**：Session 思考阶段并发，大部分时间在思考而非测试，因此并发仍能提升整体效率。

### 详细文档

- [锁机制架构](./docs/lock-mechanism/architecture.md)
- [新旧对比](./docs/lock-mechanism/comparison.md)
- [迁移指南](./docs/parallel-optimization/migration.md)

## 目录结构

```
DTAgentCLI/
├── bin/                    # CLI 入口
│   ├── dtagent.js
│   └── cfr-0.152.jar       # CFR 反编译工具
├── src/                    # TypeScript 源码
│   ├── commands/           # 命令实现
│   │   ├── init.ts
│   │   ├── generate.ts
│   │   └── extract-experience.ts
│   └── utils/              # 工具函数
│       ├── detector.ts
│       ├── cfr.ts          # CFR 反编译工具
│       └── dependency.ts   # 依赖解析
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
- Java >= 1.6（CFR 反编译需要）
- OpenCode CLI
- Java 项目（Maven 或 Gradle）

## 许可证

MIT