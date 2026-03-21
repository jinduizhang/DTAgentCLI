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

## 命令参考

### CLI 命令

#### `dtagent init [file]`

初始化 DTAgent 配置。

```bash
dtagent init                    # 自动检测
dtagent init pom.xml            # 指定 pom.xml
dtagent init --force            # 强制覆盖
dtagent init --dry-run          # 预览模式
```

#### `dtagent generate`

生成单元测试。

```bash
dtagent generate --file src/main/java/Service.java    # 单文件
dtagent generate --dir src/main/java/service          # 目录
dtagent generate --dir src/main/java --recursive      # 递归
```

#### `dtagent extract-experience`

提取 Mock 经验。

```bash
dtagent extract-experience --dir src/test/java --save
```

### OpenCode 斜杠命令

| 命令 | 参数 | 说明 |
|------|------|------|
| `/init-dt` | - | 初始化项目 DT 配置 |
| `/generate-dt-single` | `{file}` | 端到端单文件测试生成 |
| `/generate-dt-dir` | `{dir}` [--recursive] | 批量端到端测试生成 |
| `/task-status-dt` | - | 查看批量任务进度 |
| `/mr-ut` | [--base BRANCH] [--target BRANCH] | MR 变更 UT 分析 |
| `/fix-ut` | `{test}` | 修复失败的测试 |
| `/coverage` | `[target]` [--threshold N] | 分析测试覆盖率 |
| `/coverage-fill` | [--threshold N] [--limit N] | 项目级覆盖率补齐 |
| `/extract-experience` | `[target]` [--save] | 提取 Mock 经验 |

#### 命令详细说明

**`/init-dt`**

初始化项目 DT 配置，检测测试框架版本，安装组件到 `.opencode/` 目录。

**`/generate-dt-single {file}`**

为单个 Java 文件执行端到端测试生成：生成 → 修复 → 覆盖率提升。

```
/generate-dt-single src/main/java/service/OrderService.java
```

**`/generate-dt-dir {dir}`**

批量生成测试，使用任务管理插件串行执行。

```
/generate-dt-dir src/main/java/service
/generate-dt-dir src/main/java --recursive
```

**启动后使用 `/task-status-dt` 查看进度。**

**`/mr-ut [--base BRANCH]`**

基于 Git Diff 分析变更代码，为变更方法生成测试。

```
/mr-ut                          # 默认 base=main
/mr-ut --base develop           # 指定基准分支
```

**`/fix-ut {test}`**

调用 fix-java-ut 技能修复失败的测试。

```
/fix-ut OrderServiceTest
/fix-ut OrderServiceTest#testCreateOrder
```

**`/coverage [target]`**

分析测试覆盖率，识别测试盲区。

```
/coverage                       # 整个项目
/coverage com.example.service   # 指定包
/coverage --threshold 80        # 指定阈值
```

**`/coverage-fill [--threshold N]`**

批量补充测试，将覆盖率提升到目标值。

```
/coverage-fill --threshold 80
/coverage-fill --limit 20       # 最多生成20个测试
```

**`/extract-experience [target] [--save]`**

从现有测试提取 Mock 模式。

```
/extract-experience src/test/java --save
```

## 端到端流程

`/generate-dt-single`、`/generate-dt-dir`、`/mr-ut` 执行相同的端到端流程：

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  generate-java-ut   │ →  │    fix-java-ut      │ →  │   java-coverage     │
│     生成测试        │    │    修复测试         │    │   提升覆盖率        │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## 目录结构

```
项目根目录/
├── .opencode/                    # OpenCode 配置
│   ├── skills/                   # 技能定义
│   │   ├── generate-java-ut/
│   │   │   └── experiences/      # 经验库
│   │   ├── fix-java-ut/
│   │   ├── java-coverage/
│   │   └── init-dt/
│   ├── plugins/
│   │   └── task-manager.ts
│   ├── agents/
│   │   └── dtagent.md
│   └── commands/                 # 斜杠命令
├── opencode.json                 # OpenCode 配置
└── DT_AGENTS.md                  # 项目测试架构
```

## 经验库

### 位置

```
.opencode/skills/generate-java-ut/experiences/
├── README.md       # 使用说明
├── template.md     # 经验模板
├── mockito.md      # Mockito 框架经验
└── your-custom.md  # 自定义经验
```

### 添加经验

**自动提取：**

```bash
dtagent extract-experience --dir src/test/java --save
```

**手动添加：**

1. 复制模板：`cp template.md my-mock.md`
2. 编辑填写
3. 保存生效

### 经验格式

```markdown
---
title: 经验标题
type: 二方件Mock
tags: [tag1, tag2]
---

## 适用场景
描述使用场景

## 代码示例
@Mock
private YourDependency dependency;

## 注意事项
- 注意点
```

## 前置条件

- Node.js >= 18.0.0
- OpenCode CLI
- Java 项目（Maven 或 Gradle）

## 许可证

MIT