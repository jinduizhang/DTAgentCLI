# DTAgentCLI 工作计划

## TL;DR

> **快速摘要**: 构建 TypeScript CLI 工具，封装 OpenCode 命令，提供智能化 UT 生成能力。渐进式开发，一期实现 init + generate 命令。
>
> **交付物**:
> - dtagent CLI 工具（npm 包）
> - init 命令（框架检测、组件安装、经验提取、配置生成）
> - generate 命令（单文件/批量 UT 生成）
> - DT_AGENTS.md 自动生成能力
>
> **预估工作量**: Medium
> **并行执行**: NO - 串行执行，逐个任务完成
> **关键路径**: Task 1 → Task 2 → ... → Task 12 → Final

---

## 背景

### 原始需求

用户正在开发 DTAgentCLI - 一个基于 OpenCode 的智能化 UT 生成 CLI 工具，需要设计功能场景。

### 讨论摘要

**核心场景**:
- 批量生成 UT：扫描目录，批量生成测试
- 单文件 UT 生成：指定单个文件生成/修复测试
- 覆盖率分析：分析覆盖率，定位缺失测试的代码
- 测试失败修复：自动检测失败测试并修复
- MR 变更 UT 分析：基于 Git Diff 为变更代码生成测试
- 项目级覆盖率 UT 补齐：分析整体覆盖率，补充高价值测试

**关键决策**:
- 执行模型：CLI 封装 opencode 命令
- 配置管理：复用 .opencode/ 目录
- 部署方式：npm 包 + dtagent init 按需复制
- 开发策略：渐进式（一期：框架 + init + generate）

**用户痛点**:
- mvn test 自定义配置影响修复能力
- 自定义 Mock 经验影响生成准确度

### 研究发现

**OpenCodeTaskManagerPlugin**:
- 任务队列模式（扫描 → 执行 → 汇总）
- Session 独立管理，支持串行/并行执行
- 项目隔离机制

**DTAgent**:
- 经验融入机制（experiences/ 目录）
- 智能匹配算法
- Maven test 集成

---

## 工作目标

### 核心目标

构建 DTAgentCLI 一期版本，实现 `init` 和 `generate` 命令。

### 具体交付物

- dtagent CLI 工具（可 npm install -g 安装）
- dtagent init 命令
- dtagent generate 命令（单文件 + 批量）
- DT_AGENTS.md 自动生成
- 经验提取功能
- **CLI 工具打包文档**（如何构建、打包、发布）
- **init 初始化文档**（使用指南、配置说明）

### 完成定义

- [ ] `npm install -g @dtagent/cli` 成功安装
- [ ] `dtagent init` 在 Java 项目中成功执行
- [ ] `dtagent generate --file Service.java` 成功生成测试
- [ ] `dtagent generate --dir src/main/java` 批量生成测试
- [ ] DT_AGENTS.md 自动生成，包含正确的框架配置

### 必须包含

- TypeScript CLI 框架
- init 命令（框架检测、组件安装、经验提取、配置生成）
- generate 命令（单文件/批量）
- 复用现有 DTAgent skills 和 TaskManagerPlugin

### 必须不包含（边界）

- fix 命令（二期）
- coverage 命令（二期）
- mr 命令（三期）
- TypeScript/Python 语言支持（后续扩展）
- 独立配置文件（只用 DT_AGENTS.md）

---

## 验证策略

### 测试决策

- **基础设施存在**: NO（新建项目）
- **自动化测试**: 先搭脚手架
- **框架**: bun test / vitest
- **Agent-Executed QA**: 所有任务必须包含 QA 场景

### QA 策略

每个任务必须包含 Agent 执行的 QA 场景：
- CLI 命令执行验证
- 输出文件检查
- 错误场景处理

---

## 执行策略

### 串行执行策略

> 为避免并行执行带来的潜在问题，采用串行执行模式。
> 每个任务完成后，再开始下一个任务。确保稳定性和可调试性。

```
任务执行顺序（串行）:

Phase 1: 基础设施
├── Task 1: 项目初始化 + package.json
├── Task 2: CLI 框架搭建 (commander)
├── Task 3: 构建配置 (tsconfig, build)
└── Task 4: templates 目录结构

Phase 2: init 命令
├── Task 5: init 命令 - 框架检测
├── Task 6: init 命令 - 组件安装
├── Task 7: init 命令 - 经验提取
└── Task 8: init 命令 - 配置生成

Phase 3: generate 命令
├── Task 9: generate 命令 - 单文件模式
├── Task 10: generate 命令 - 批量模式
├── Task 11: TaskManagerPlugin 集成
└── Task 12: 报告生成功能

Phase FINAL: 验证与发布
├── Task F1: 集成测试 - init 流程
├── Task F2: 集成测试 - generate 流程
├── Task F3: 文档完善
└── Task F4: npm 发布准备

关键路径: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → F1 → F2 → F3 → F4
```

---

## TODOs

- [ ] 1. 项目初始化 + package.json

  **要做什么**:
  - 创建 DTAgentCLI 目录结构
  - 初始化 package.json，配置 bin 入口
  - 安装依赖：commander, chalk, ora, cli-table3
  - 配置 TypeScript 编译

  **不要做什么**:
  - 不要安装过多无关依赖
  - 不要配置复杂的 lint 规则（后续再加）

  **推荐 Agent Profile**:
  - **Category**: `quick`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 1, Task 1 of 4
  - **依赖**: 无前置依赖
  - **阻塞**: Tasks 2-12, F1-F4

  **参考文件**:
  - `D:\OpenCode\OpenCodeTaskManagerPlugin\package.json` - 依赖配置示例
  - `D:\OpenCode\DTAgent\.opencode\package.json` - OpenCode SDK 依赖

  **验收标准**:
  - [ ] package.json 存在，包含 name, version, bin 字段
  - [ ] npm install 成功
  - [ ] TypeScript 配置正确

  **QA 场景**:
  ```
  Scenario: 项目初始化成功
    Tool: Bash
    Steps:
      1. cd D:\OpenCode\DTAgentCLI
      2. npm install
      3. npx tsc --version
    Expected Result: 依赖安装成功，tsc 可用
    Evidence: .sisyphus/evidence/task-01-init.log
  ```

- [ ] 2. CLI 框架搭建 (commander)

  **要做什么**:
  - 创建 bin/dtagent 入口文件
  - 创建 src/index.ts 主文件
  - 使用 commander 实现 CLI 框架
  - 定义基础命令结构：init, generate, fix, coverage, mr
  - 实现帮助信息和版本显示

  **不要做什么**:
  - 不要实现命令的具体逻辑（只定义骨架）
  - 不要添加复杂的参数验证

  **推荐 Agent Profile**:
  - **Category**: `quick`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 1, Task 2 of 4
  - **依赖**: Task 1 完成
  - **阻塞**: Tasks 3-12, F1-F4

  **参考文件**:
  - commander 官方文档：https://github.com/tj/commander.js

  **验收标准**:
  - [ ] `dtagent --help` 显示帮助信息
  - [ ] `dtagent --version` 显示版本
  - [ ] 命令结构定义完整

**QA 场景**:
  ```
  Scenario: CLI 版本显示
    Tool: Bash
    Steps:
      1. node bin/dtagent --version
    Expected Result: 显示 package.json 中定义的版本
    Evidence: .sisyphus/evidence/task-02-version.log
  ```

- [ ] 3. 构建配置 (tsconfig, build)

  **要做什么**:
  - 创建 tsconfig.json，配置编译选项
  - 配置输出目录 dist/
  - 添加 npm scripts: build, dev
  - 确保编译后可执行

  **不要做什么**:
  - 不要配置 source map（开发阶段不需要）
  - 不要配置复杂的类型检查

  **推荐 Agent Profile**:
  - **Category**: `quick`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 1, Task 3 of 4
  - **依赖**: Task 2 完成
  - **阻塞**: Tasks 4-12, F1-F4

  **验收标准**:
  - [ ] npm run build 成功
  - [ ] dist/ 目录生成
  - [ ] node dist/index.js 可执行

  **QA 场景**:
  ```
  Scenario: 构建成功
    Tool: Bash
    Steps:
      1. npm run build
      2. ls dist/
    Expected Result: dist/ 目录存在，包含编译后的 .js 文件
    Evidence: .sisyphus/evidence/task-03-build.log
  ```

- [ ] 4. templates 目录结构

  **要做什么**:
  - 创建 templates/ 目录
  - 复制 DTAgent skills 到 templates/skills/
  - 复制 TaskManagerPlugin 到 templates/plugins/
  - 创建模板配置文件结构

  **目录结构**:
  ```
  templates/
  ├── skills/
  │   ├── generate-java-ut/
  │   │   ├── SKILL.md
  │   │   └── experiences/
  │   ├── fix-java-ut/
  │   │   └── SKILL.md
  │   ├── java-coverage/
  │   │   └── SKILL.md
  │   └── init-dt/
  │       ├── SKILL.md
  │       └── experiences/
  ├── agents/
  │   └── DTAgent.md
  └── plugins/
      └── task-manager.ts
  ```

  **推荐 Agent Profile**:
  - **Category**: `quick`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 1, Task 4 of 4
  - **依赖**: Task 3 完成
  - **阻塞**: Tasks 5-12, F1-F4

  **参考文件**:
  - `D:\OpenCode\DTAgent\.opencode\skills\generate-java-ut\` - 复制此目录
  - `D:\OpenCode\OpenCodeTaskManagerPlugin\task-manager.ts` - 复制此文件

  **验收标准**:
  - [ ] templates/ 目录结构完整
  - [ ] 所有 skill 文件存在
  - [ ] task-manager.ts 存在

  **QA 场景**:
  ```
  Scenario: Templates 目录完整
    Tool: Bash
    Steps:
      1. ls templates/skills/
      2. ls templates/plugins/
      3. cat templates/skills/generate-java-ut/SKILL.md | head -5
    Expected Result: 目录结构正确，文件可读
    Evidence: .sisyphus/evidence/task-04-templates.log
  ```

- [ ] 5. init 命令 - 框架检测

  **要做什么**:
  - 实现 `dtagent init` 命令
  - 检测项目类型（Maven/Gradle）
  - 检测测试框架版本（JUnit 4/5, Mockito）
  - 检测 Spring Boot 版本
  - 检测特殊配置需求（内网环境、自定义 settings.xml）

  **检测逻辑**:
  ```typescript
  // 读取 pom.xml
  // 解析 <dependencies> 获取版本
  // 识别 JUnit/Mapito/SpringBoot
  // 检查是否存在 settings.xml
  ```

  **推荐 Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 2, Task 5 of 4
  - **依赖**: Task 4 完成
  - **阻塞**: Tasks 6-12, F1-F4

  **参考文件**:
  - `D:\OpenCode\config-history\pom.xml` - Maven 配置示例
  - `D:\OpenCode\DTAgent\.opencode\skills\init-dt\SKILL.md` - 现有检测逻辑

  **验收标准**:
  - [ ] 在 Maven 项目中运行，正确检测框架版本
  - [ ] 输出检测结果到控制台

  **QA 场景**:
  ```
  Scenario: 框架检测成功
    Tool: Bash
    Preconditions: 在 config-history 项目目录
    Steps:
      1. cd D:\OpenCode\config-history
      2. dtagent init --dry-run
    Expected Result: 输出 "JUnit 5.9.3, Mockito 5.4.0, Spring Boot 3.2.0"
    Evidence: .sisyphus/evidence/task-05-detect.log
  ```

- [ ] 6. init 命令 - 组件安装

  **要做什么**:
  - 从 templates/ 复制 skills 到项目的 .opencode/skills/
  - 复制 plugins 到 .opencode/plugins/
  - 复制 agents 到 .opencode/agents/
  - 生成 .opencode/package.json 并安装依赖

  **安装逻辑**:
  ```typescript
  // 检测项目类型，选择要复制的 skills
  // 复制文件到目标目录
  // 如果 .opencode/package.json 不存在，创建它
  // cd .opencode && npm install
  ```

  **推荐 Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 2, Task 6 of 4
  - **依赖**: Task 5 完成
  - **阻塞**: Tasks 7-12, F1-F4

  **验收标准**:
  - [ ] .opencode/skills/ 目录存在
  - [ ] .opencode/plugins/task-manager.ts 存在
  - [ ] .opencode/node_modules 存在

  **QA 场景**:
  ```
  Scenario: 组件安装成功
    Tool: Bash
    Steps:
      1. dtagent init
      2. ls .opencode/skills/
      3. ls .opencode/plugins/
    Expected Result: 目录结构正确，依赖安装成功
    Evidence: .sisyphus/evidence/task-06-install.log
  ```

- [ ] 7. init 命令 - 经验提取

  **要做什么**:
  - 扫描 src/test/java/**/*.java
  - 识别 Mock 模式（@Mock, @MockBean, when().thenReturn()）
  - 提取公共模式，生成经验条目
  - 支持 `--file` 参数指定单个测试类提取

  **提取逻辑**:
  ```typescript
  // 1. 扫描测试文件
  // 2. AST 解析或正则匹配识别 Mock 模式
  // 3. 聚类分析，识别公共模式
  // 4. 生成经验条目（name, pattern, template, notes）
  ```

  **推荐 Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 2, Task 7 of 4
  - **依赖**: Task 6 完成
  - **阻塞**: Tasks 8-12, F1-F4

  **参考文件**:
  - `D:\OpenCode\config-history\src\test\java\` - 测试文件示例
  - `D:\OpenCode\DTAgent\.opencode\skills\generate-java-ut\experiences\diamond-mock.md` - 经验格式

  **验收标准**:
  - [ ] 能识别测试文件中的 @Mock 使用
  - [ ] 生成的经验条目格式正确

  **QA 场景**:
  ```
  Scenario: 经验提取成功
    Tool: Bash
    Preconditions: 在 config-history 项目目录
    Steps:
      1. dtagent init
      2. grep "mockExperiences" DT_AGENTS.md
    Expected Result: DT_AGENTS.md 包含提取的经验
    Evidence: .sisyphus/evidence/task-07-experience.log

  Scenario: 指定文件提取经验
    Tool: Bash
    Steps:
      1. dtagent extract-experience --file HistoryServiceTest.java
    Expected Result: 输出该文件中的 Mock 模式
    Evidence: .sisyphus/evidence/task-07-extract-single.log
  ```

- [ ] 8. init 命令 - 配置生成

  **要做什么**:
  - 生成 DT_AGENTS.md 文件
  - 包含 Maven 配置（settings, profiles, jvmArgs）
  - 包含测试框架版本
  - 包含覆盖率目标
  - 包含 Mock 经验库

  **DT_AGENTS.md 结构**:
  ```yaml
  ## Maven 配置
  maven:
    settings: /path/to/settings.xml
    profiles: [dev]
    sslInsecure: true

  ## 测试框架
  framework:
    language: java
    junit: 5.9.3
    mockito: 5.4.0
    springBoot: 3.2.0

  ## Mock 经验库
  mockExperiences:
    - name: Diamond 配置中心
      pattern: com.alibaba.diamond.DiamondClient
      template: |
        @Mock
        private DiamondClient diamondClient;
      notes:
        - 配置有缓存，需要独立设置
  ```

  **推荐 Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 2, Task 8 of 4
  - **依赖**: Task 7 完成
  - **阻塞**: Tasks 9-12, F1-F4

  **参考文件**:
  - `D:\OpenCode\config-history\DT_AGENTS.md` - 现有配置示例

  **验收标准**:
  - [ ] DT_AGENTS.md 文件存在
  - [ ] 包含正确的框架版本
  - [ ] 包含 Maven 配置

  **QA 场景**:
  ```
  Scenario: 配置生成成功
    Tool: Bash
    Steps:
      1. dtagent init
      2. cat DT_AGENTS.md
    Expected Result: DT_AGENTS.md 内容格式正确
    Evidence: .sisyphus/evidence/task-08-config.log
  ```

- [ ] 9. generate 命令 - 单文件模式

  **要做什么**:
  - 实现 `dtagent generate --file <path>` 命令
  - 读取 DT_AGENTS.md 获取配置
  - 构建调用 opencode 的 prompt
  - 执行 `opencode -p "@generate-java-ut {filepath}"`
  - 等待执行完成，输出结果

  **执行流程**:
  ```typescript
  // 1. 解析 --file 参数，获取文件绝对路径
  // 2. 读取 DT_AGENTS.md，获取 maven 配置
  // 3. 构建 prompt，包含文件路径和配置信息
  // 4. 调用 opencode 命令
  // 5. 捕获输出，格式化显示
  ```

  **推荐 Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 3, Task 9 of 4
  - **依赖**: Task 8 完成
  - **阻塞**: Tasks 10-12, F1-F4

  **参考文件**:
  - `D:\OpenCode\DTAgent\.opencode\skills\generate-java-ut\SKILL.md` - skill 调用方式

  **验收标准**:
  - [ ] `dtagent generate --file Service.java` 执行成功
  - [ ] 调用 opencode 正确
  - [ ] 输出测试生成结果

  **QA 场景**:
  ```
  Scenario: 单文件生成成功
    Tool: Bash
    Preconditions: 已运行 dtagent init
    Steps:
      1. dtagent generate --file src/main/java/service/HistoryService.java
    Expected Result: 输出生成的测试代码
    Evidence: .sisyphus/evidence/task-09-single.log
  ```

- [ ] 10. generate 命令 - 批量模式

  **要做什么**:
  - 实现 `dtagent generate --dir <path> --recursive` 命令
  - 扫描目录获取文件列表
  - 集成 TaskManagerPlugin 批量执行
  - 支持并行参数 `--parallel N`

  **批量执行流程**:
  ```typescript
  // 1. 扫描目录，获取文件列表
  // 2. 调用 TaskManagerPlugin.task-create()
  // 3. 调用 TaskManagerPlugin.task-start()
  // 4. 轮询状态，等待完成
  // 5. 调用 TaskManagerPlugin.task-summary() 获取结果
  ```

  **推荐 Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 3, Task 10 of 4
  - **依赖**: Task 9 完成
  - **阻塞**: Tasks 11-12, F1-F4

  **参考文件**:
  - `D:\OpenCode\OpenCodeTaskManagerPlugin\task-manager.ts` - 批量执行逻辑

  **验收标准**:
  - [ ] 扫描目录正确
  - [ ] 批量执行成功
  - [ ] 汇总结果正确

  **QA 场景**:
  ```
  Scenario: 批量生成成功
    Tool: Bash
    Preconditions: 已运行 dtagent init
    Steps:
      1. dtagent generate --dir src/main/java/service --recursive
      2. 等待执行完成
    Expected Result: 输出批量执行结果汇总
    Evidence: .sisyphus/evidence/task-10-batch.log
  ```

- [ ] 11. TaskManagerPlugin 集成

  **要做什么**:
  - 在 CLI 中集成 TaskManagerPlugin
  - 封装调用接口
  - 实现状态轮询
  - 实现结果汇总

  **集成方式**:
  ```typescript
  // CLI 作为 OpenCode 插件的调用者
  // 通过 child_process 执行 opencode 命令
  // 或通过 OpenCode SDK API 调用（如果有）

  // 方案1: 命令行调用
  exec('opencode -p "task-create dir=..."')

  // 方案2: 复用 plugin 代码
  import { TaskManagerPlugin } from './templates/plugins/task-manager'
  ```

  **推荐 Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 3, Task 11 of 4
  - **依赖**: Task 10 完成
  - **阻塞**: Tasks 12, F1-F4

  **参考文件**:
  - `D:\OpenCode\OpenCodeTaskManagerPlugin\task-manager.ts` - 插件源码

  **验收标准**:
  - [ ] 可以通过 CLI 调用 TaskManagerPlugin
  - [ ] 状态轮询正常
  - [ ] 结果汇总正确

  **QA 场景**:
  ```
  Scenario: TaskManager 集成成功
    Tool: Bash
    Steps:
      1. dtagent generate --dir src/main/java/service
      2. 检查 Session 创建数量
    Expected Result: 每个 Java 文件创建一个 Session
    Evidence: .sisyphus/evidence/task-11-integration.log
  ```

- [ ] 12. 报告生成功能

  **要做什么**:
  - 生成 JSON 格式报告：.dtagent/reports/ut-report.json
  - 生成 Markdown 格式报告：.dtagent/reports/ut-report.md
  - 记录执行日志：.dtagent/logs/{date}.log

  **报告内容**:
  ```json
  {
    "timestamp": "2024-03-21T10:00:00Z",
    "command": "generate",
    "files": [
      {
        "source": "HistoryService.java",
        "test": "HistoryServiceTest.java",
        "status": "success",
        "coverage": "85%"
      }
    ],
    "summary": {
      "total": 10,
      "success": 8,
      "failed": 2
    }
  }
  ```

  **推荐 Agent Profile**:
  - **Category**: `quick`
  - **Skills**: 无

  **并行化**:
  - **执行模式**: 串行
  - **执行顺序**: Phase 3, Task 12 of 4
  - **依赖**: Task 11 完成
  - **阻塞**: Tasks F1-F4

  **验收标准**:
  - [ ] 报告文件生成正确
  - [ ] 日志记录完整

  **QA 场景**:
  ```
  Scenario: 报告生成成功
    Tool: Bash
    Steps:
      1. dtagent generate --file Service.java
      2. cat .dtagent/reports/ut-report.json
    Expected Result: JSON 报告格式正确
    Evidence: .sisyphus/evidence/task-12-report.log
  ```

---

## Final Verification Wave（所有实现任务完成后）

> 4 个验证任务串行执行，逐个完成后需要用户确认。

- [ ] F1. 集成测试 - init 流程

  **执行模式**: 串行，Task F1 of 4

  **要做什么**:
  - 在真实 Java 项目（如 config-history）中执行 `dtagent init`
  - 验证框架检测正确性
  - 验证组件安装完整性
  - 验证 DT_AGENTS.md 生成正确性
  - 验证经验提取有效性

  **推荐 Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无

  **验收标准**:
  - [ ] init 执行无报错
  - [ ] 框架版本检测正确
  - [ ] .opencode/ 目录结构完整
  - [ ] DT_AGENTS.md 内容正确

  **QA 场景**:
  ```
  Scenario: 完整 init 流程
    Tool: Bash
    Preconditions: 在干净的 Java 项目目录
    Steps:
      1. dtagent init
      2. 检查 .opencode/ 目录
      3. 检查 DT_AGENTS.md
      4. 运行 opencode 验证 skill 可用
    Expected Result: 所有检查通过
    Evidence: .sisyphus/evidence/final-01-init.log
  ```

- [ ] F2. 集成测试 - generate 流程

  **执行模式**: 串行，Task F2 of 4

  **要做什么**:
  - 执行单文件生成测试
  - 执行批量生成测试
  - 验证生成的测试代码可编译
  - 验证 mvn test 执行成功

  **推荐 Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无

  **验收标准**:
  - [ ] 单文件生成成功
  - [ ] 批量生成成功
  - [ ] 生成的测试编译通过
  - [ ] mvn test 执行成功

  **QA 场景**:
  ```
  Scenario: 完整 generate 流程
    Tool: Bash
    Preconditions: 已运行 dtagent init
    Steps:
      1. dtagent generate --file src/main/java/service/HistoryService.java
      2. mvn test-compile
      3. mvn test -Dtest=HistoryServiceTest
    Expected Result: 测试生成并执行成功
    Evidence: .sisyphus/evidence/final-02-generate.log
  ```

- [ ] F3. 文档完善

  **执行模式**: 串行，Task F3 of 4

  **要做什么**:
  - 编写 README.md（项目概述、快速开始）
  - **编写 CLI 工具打包文档**（docs/packaging.md）:
    - 如何构建：`npm run build`
    - 如何本地测试：`npm link`
    - 如何发布：`npm publish`
    - 版本管理策略
  - **编写 init 初始化文档**（docs/init-guide.md）:
    - 命令用法：`dtagent init [options]`
    - 框架检测说明
    - 组件安装流程
    - DT_AGENTS.md 配置详解
    - 经验提取功能说明
    - 常见问题与解决方案
  - 编写 generate 命令文档（docs/generate-guide.md）
  - 添加使用示例

  **推荐 Agent Profile**:
  - **Category**: `writing`
  - **Skills**: 无

  **验收标准**:
  - [ ] README.md 完整
  - [ ] docs/packaging.md 包含完整的打包发布流程
  - [ ] docs/init-guide.md 包含详细的使用指南
  - [ ] 安装说明清晰
  - [ ] 命令文档完整

  **QA 场景**:
  ```
  Scenario: 文档完整性检查
    Tool: Bash
    Steps:
      1. 检查 README.md 是否包含安装说明
      2. 检查是否包含使用示例
      3. 检查 docs/packaging.md 是否存在
      4. grep "npm publish" docs/packaging.md
      5. 检查 docs/init-guide.md 是否存在
      6. grep "dtagent init" docs/init-guide.md
    Expected Result: 所有文档完整，内容正确
    Evidence: .sisyphus/evidence/final-03-docs.log
  ```

- [ ] F4. npm 发布准备

  **执行模式**: 串行，Task F4 of 4

  **要做什么**:
  - 检查 package.json 配置
  - 添加 .npmignore
  - 测试 npm link 本地安装
  - 准备发布命令

  **推荐 Agent Profile**:
  - **Category**: `quick`
  - **Skills**: 无

  **验收标准**:
  - [ ] npm link 成功
  - [ ] dtagent 命令全局可用
  - [ ] 发布准备就绪

  **QA 场景**:
  ```
  Scenario: npm 安装测试
    Tool: Bash
    Steps:
      1. npm link
      2. cd /tmp
      3. dtagent --version
    Expected Result: dtagent 命令可用
    Evidence: .sisyphus/evidence/final-04-npm.log
  ```

---

## Commit Strategy

每个 Phase 完成后提交一次：
- Phase 1: `feat: 初始化 CLI 项目框架`
- Phase 2: `feat: 实现 init 命令`
- Phase 3: `feat: 实现 generate 命令`
- Final: `docs: 完善文档，准备发布`

---

## 成功标准

### 验证命令

```bash
# 安装
npm install -g @dtagent/cli

# 初始化
cd test-java-project
dtagent init
cat DT_AGENTS.md

# 单文件生成
dtagent generate --file src/main/java/Service.java

# 批量生成
dtagent generate --dir src/main/java --recursive
```

### 最终检查清单

- [ ] 所有 "必须包含" 功能已实现
- [ ] 所有 "必须不包含" 功能未涉及
- [ ] 集成测试通过
- [ ] 文档完整