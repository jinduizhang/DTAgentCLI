# 任务队列并行隔离优化

## TL;DR

> **目标**：解决文件级并行执行时 Maven 编译冲突问题，提升任务队列执行效率
> 
> **方案**：为每个并行任务创建独立工作目录（软链接源码 + 独立 .m2 仓库）
> 
> **策略**：先原型验证，再集成到现有 task-manager.ts

**Deliverables**:
- 工作空间隔离原型验证脚本
- WorkspaceManager 工作空间管理模块
- TaskManager 并行隔离集成
- 性能对比测试报告

**Estimated Effort**: Medium
**Parallel Execution**: YES - 2 phases
**Critical Path**: 原型验证 → 核心实现 → 集成测试

---

## Context

### Original Request

用户反馈：
1. 串行执行任务队列太慢
2. 并行执行时 Maven 编译会互相冲突
3. 已有 `batchSize` 参数，需要基于文件级并发

### Current Implementation

**现有代码** (`templates/plugins/task-manager.ts`):
```typescript
// batchSize 已经支持并行
batchSize: tool.schema.number().optional().default(1).describe("并行数"),

// 执行时使用 Promise.all
const promises = batchIndices.map(i => executeTask(i))
const results = await Promise.all(promises)
```

**问题**：多个任务并行时，都在同一个项目目录下执行 `mvn test`，导致：
- 编译产物冲突（target 目录）
- Maven 依赖下载冲突（.m2 仓库）
- 测试结果互相覆盖

### Solution Design

**工作目录结构**：
```
.dtagent/workspace/
├── task-{hash1}/           # 任务独立工作目录
│   ├── src -> ../../../src     # 软链接
│   ├── pom.xml -> ../../../pom.xml
│   ├── .m2/                    # 独立 Maven 仓库
│   └── target/                 # 编译产物
├── task-{hash2}/
│   └── ...
└── ...
```

**并行规则**：
- 每个类（文件）→ 独立工作目录
- batchSize > 1 时，多个类可同时并行执行
- 无目录分组逻辑（类级完全并行）

**生命周期**：
- 任务开始 → 创建工作目录
- 任务完成 → 立即清理工作目录

### Key Decisions

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 工作空间策略 | 软链接源码 | 测试生成不改源码，节省磁盘 |
| Maven 仓库 | 独立 .m2 | 完全隔离，避免依赖冲突 |
| 并行粒度 | 类级完全并行 | 最简单，并行度最高 |
| 生命周期 | 完成立即清理 | 不占用磁盘 |
| 并行度 | batchSize 参数 | 用户可控，默认值 CPU-1 |
| 验证策略 | 先原型验证 | 降低风险 |

---

## Work Objectives

### Core Objective

实现文件级并行执行时的 Maven 编译隔离，支持 batchSize > 1 的并行执行。

### Concrete Deliverables

1. `.sisyphus/scripts/workspace-isolation-prototype.ts` - 原型验证脚本
2. `src/core/workspace-manager.ts` - 工作空间管理模块
3. `templates/plugins/task-manager.ts` - 集成隔离机制
4. 测试验证报告

### Definition of Done

- [ ] batchSize=4 时，4 个任务可并行执行且无 Maven 冲突
- [ ] 工作目录在任务完成后自动清理
- [ ] 性能提升明显（对比串行执行）

### Must Have

- 软链接正确指向源码目录
- 每个 task 有独立 .m2 仓库
- 任务完成后清理工作目录
- 支持 Windows 和 Unix 系统

### Must NOT Have

- 修改用户源码目录
- 保留已完成任务的工作目录
- 硬编码 mvn 命令（从 DT_AGENTS.md 读取）

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (bun test)
- **Automated tests**: TDD
- **Framework**: bun test
- **QA Policy**: Agent-Executed QA Scenarios

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (原型验证 - 独立可验证):
├── Task 1: 创建原型验证脚本 [quick]
├── Task 2: 验证软链接创建 [quick]
└── Task 3: 验证独立 .m2 编译隔离 [quick]

Wave 2 (核心实现 - 依赖原型验证通过):
├── Task 4: WorkspaceManager 模块 [unspecified-high]
├── Task 5: TaskManager 集成 [unspecified-high]
└── Task 6: 清理机制 [quick]

Wave FINAL (验证):
├── F1: 集成测试 [unspecified-high]
└── F2: 性能对比测试 [unspecified-high]
```

### Dependency Matrix

- **1-3**: — (无依赖，可并行)
- **4**: 1, 2, 3 (依赖原型验证通过)
- **5**: 4
- **6**: 4
- **F1**: 5, 6
- **F2**: F1

---

## TODOs

- [ ] 1. **创建原型验证脚本**

  **What to do**:
  - 创建 `.sisyphus/scripts/workspace-isolation-prototype.ts`
  - 实现工作目录创建逻辑（软链接 + 独立 .m2）
  - 实现清理逻辑
  - 提供可执行的验证入口

  **Must NOT do**:
  - 修改用户源码目录
  - 创建实际的 Maven 项目（只验证隔离机制）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [] (无特殊技能需求)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `templates/plugins/task-manager.ts:141-180` - 现有并行执行逻辑
  - `src/utils/detector.ts` - 项目检测逻辑

  **Acceptance Criteria**:
  - [ ] 脚本可独立运行：`bun run .sisyphus/scripts/workspace-isolation-prototype.ts`
  - [ ] 输出工作目录创建/清理日志

  **QA Scenarios**:
  ```
  Scenario: 原型脚本可执行
    Tool: Bash
    Steps:
      1. bun run .sisyphus/scripts/workspace-isolation-prototype.ts
      2. 检查输出包含 "工作目录创建成功" 或类似成功标识
    Expected Result: 脚本正常退出，无错误
    Evidence: .sisyphus/evidence/task-1-prototype-run.log
  ```

  **Commit**: YES
  - Message: `feat(workspace): add workspace isolation prototype script`

- [ ] 2. **验证软链接创建**

  **What to do**:
  - 在原型脚本中实现软链接创建
  - 支持 Windows (`mklink /J`) 和 Unix (`ln -s`)
  - 验证软链接正确指向源码

  **Must NOT do**:
  - 使用硬链接（不支持目录）
  - 拷贝文件（浪费磁盘）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - Node.js `fs.symlink` / `fs.symlinkSync`
  - Windows: `fs.symlink(target, path, 'junction')`

  **Acceptance Criteria**:
  - [ ] Windows 上软链接创建成功
  - [ ] Unix 上软链接创建成功
  - [ ] 软链接指向正确路径

  **QA Scenarios**:
  ```
  Scenario: Windows 软链接创建
    Tool: Bash (Windows)
    Preconditions: Windows 系统
    Steps:
      1. 运行原型脚本创建工作目录
      2. 执行 `dir .dtagent\workspace\task-test\src` 验证是软链接
    Expected Result: 软链接正确指向源码目录
    Evidence: .sisyphus/evidence/task-2-symlink-win.log

  Scenario: Unix 软链接创建
    Tool: Bash (Unix)
    Preconditions: Unix/Linux/Mac 系统
    Steps:
      1. 运行原型脚本创建工作目录
      2. 执行 `ls -la .dtagent/workspace/task-test/src` 验证是软链接
    Expected Result: 软链接正确指向源码目录
    Evidence: .sisyphus/evidence/task-2-symlink-unix.log
  ```

  **Commit**: NO (与 Task 1 合并)

- [ ] 3. **验证独立 .m2 编译隔离**

  **What to do**:
  - 在原型脚本中创建独立 .m2 目录
  - 执行 Maven 编译验证隔离效果
  - 测试并行编译无冲突

  **Must NOT do**:
  - 使用共享 .m2 目录
  - 依赖系统默认 Maven 设置

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - Maven 命令：`mvn -Dmaven.repo.local=.m2 compile`
  - DT_AGENTS.md 中的编译命令

  **Acceptance Criteria**:
  - [ ] 每个 task 有独立 .m2 目录
  - [ ] 并行编译不产生冲突
  - [ ] 编译产物在各自 target 目录

  **QA Scenarios**:
  ```
  Scenario: 独立 .m2 编译
    Tool: Bash
    Preconditions: 有可编译的 Java 项目
    Steps:
      1. 创建 2 个独立工作目录，各有 .m2
      2. 同时执行 mvn compile -Dmaven.repo.local=.m2
      3. 验证两个编译过程无冲突
    Expected Result: 两个编译都成功，无锁定错误
    Evidence: .sisyphus/evidence/task-3-isolated-compile.log
  ```

  **Commit**: NO (与 Task 1 合并)

- [ ] 4. **WorkspaceManager 模块**

  **What to do**:
  - 创建 `src/core/workspace-manager.ts`
  - 实现 `createWorkspace(taskId: string)` - 创建工作目录
  - 实现 `cleanupWorkspace(taskId: string)` - 清理工作目录
  - 实现 `getWorkspacePath(taskId: string)` - 获取工作目录路径
  - 支持 Windows 和 Unix 软链接

  **Must NOT do**:
  - 硬编码项目路径
  - 保留已完成任务的工作目录

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential: Task 4 → 5, 6, 7)
  - **Blocks**: Task 5, 6, 7
  - **Blocked By**: Task 1, 2, 3 (原型验证通过)

  **References**:
  - 原型验证脚本的结果
  - `src/utils/detector.ts` - 项目根目录检测
  - Node.js `fs` 模块 - symlink, mkdir, rm

  **Acceptance Criteria**:
  - [ ] 模块可导入使用
  - [ ] `createWorkspace` 返回工作目录路径
  - [ ] `cleanupWorkspace` 删除工作目录
  - [ ] 单元测试覆盖核心功能

  **QA Scenarios**:
  ```
  Scenario: 创建工作目录
    Tool: Bash
    Steps:
      1. 调用 createWorkspace("task-001")
      2. 检查 .dtagent/workspace/task-001/ 存在
      3. 检查 src 软链接正确指向
      4. 检查 .m2 目录存在
    Expected Result: 工作目录结构正确
    Evidence: .sisyphus/evidence/task-4-create-workspace.log

  Scenario: 清理工作目录
    Tool: Bash
    Steps:
      1. 调用 createWorkspace("task-002")
      2. 调用 cleanupWorkspace("task-002")
      3. 检查 .dtagent/workspace/task-002/ 不存在
    Expected Result: 工作目录已删除
    Evidence: .sisyphus/evidence/task-4-cleanup-workspace.log
  ```

  **Commit**: YES
  - Message: `feat(core): add WorkspaceManager module`

- [ ] 5. **TaskManager 集成**

  **What to do**:
  - 修改 `templates/plugins/task-manager.ts`
  - 在 `executeTask` 中使用 WorkspaceManager
  - 任务开始时创建工作目录
  - 任务结束时清理工作目录
  - 传递 `-Dmaven.repo.local` 参数给 mvn 命令

  **Must NOT do**:
  - 硬编码 mvn 命令
  - 修改现有的队列状态管理逻辑

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (depends on Task 4)
  - **Blocks**: Task 7
  - **Blocked By**: Task 4

  **References**:
  - `templates/plugins/task-manager.ts:89-139` - executeTask 函数
  - `src/core/workspace-manager.ts` - 工作空间管理

  **Acceptance Criteria**:
  - [ ] batchSize > 1 时，每个任务有独立工作目录
  - [ ] 任务完成后工作目录自动清理
  - [ ] Maven 命令使用独立 .m2 仓库

  **QA Scenarios**:
  ```
  Scenario: 并行执行无冲突
    Tool: Bash
    Preconditions: batchSize=4, 4 个测试文件
    Steps:
      1. 运行 task-create 创建队列
      2. 设置 batchSize=4
      3. 运行 task-start
      4. 等待所有任务完成
      5. 检查 task-status 显示全部成功
    Expected Result: 4 个任务并行完成，无 Maven 冲突错误
    Evidence: .sisyphus/evidence/task-5-parallel-execution.log

  Scenario: 工作目录自动清理
    Tool: Bash
    Steps:
      1. 并行执行 4 个任务
      2. 任务完成后检查 .dtagent/workspace/ 目录
    Expected Result: workspace 目录为空或不存在
    Evidence: .sisyphus/evidence/task-5-auto-cleanup.log
  ```

  **Commit**: YES
  - Message: `feat(task-manager): integrate workspace isolation for parallel execution`

- [ ] 6. **清理机制**

  **What to do**:
  - 实现任务完成后的清理逻辑
  - 处理异常情况下的清理（try-finally）
  - 添加清理日志

  **Must NOT do**:
  - 清理用户源码目录
  - 保留任何中间产物

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 6, after Task 4)
  - **Blocks**: F1
  - **Blocked By**: Task 4, Task 5

  **References**:
  - `src/core/workspace-manager.ts:cleanupWorkspace`
  - Node.js `fs.rm` - 递归删除

  **Acceptance Criteria**:
  - [ ] 任务成功完成后清理
  - [ ] 任务失败后也清理
  - [ ] 异常中断时尽可能清理

  **QA Scenarios**:
  ```
  Scenario: 成功任务清理
    Tool: Bash
    Steps:
      1. 执行一个成功完成的任务
      2. 检查工作目录是否被删除
    Expected Result: 工作目录不存在
    Evidence: .sisyphus/evidence/task-7-success-cleanup.log

  Scenario: 失败任务清理
    Tool: Bash
    Steps:
      1. 执行一个会失败的任务
      2. 检查工作目录是否被删除
    Expected Result: 工作目录不存在
    Evidence: .sisyphus/evidence/task-7-failure-cleanup.log
  ```

  **Commit**: NO (与 Task 5 合并)

- [ ] 6. **清理机制**

  **What to do**:
  - 实现任务完成后的清理逻辑
  - 处理异常情况下的清理（try-finally）
  - 添加清理日志

  **Must NOT do**:
  - 清理用户源码目录
  - 保留任何中间产物

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 6, after Task 4)
  - **Blocks**: F1
  - **Blocked By**: Task 4, Task 5

  **References**:
  - `src/core/workspace-manager.ts:cleanupWorkspace`
  - Node.js `fs.rm` - 递归删除

  **Acceptance Criteria**:
  - [ ] 任务成功完成后清理
  - [ ] 任务失败后也清理
  - [ ] 异常中断时尽可能清理

  **QA Scenarios**:
  ```
  Scenario: 成功任务清理
    Tool: Bash
    Steps:
      1. 执行一个成功完成的任务
      2. 检查工作目录是否被删除
    Expected Result: 工作目录不存在
    Evidence: .sisyphus/evidence/task-6-success-cleanup.log

  Scenario: 失败任务清理
    Tool: Bash
    Steps:
      1. 执行一个会失败的任务
      2. 检查工作目录是否被删除
    Expected Result: 工作目录不存在
    Evidence: .sisyphus/evidence/task-6-failure-cleanup.log
  ```

  **Commit**: NO (与 Task 5 合并)

---

## Final Verification Wave

- [ ] F1. **集成测试**

  **What to do**:
  - 创建端到端测试场景
  - 验证 batchSize > 1 时并行执行无冲突
  - 验证工作目录自动清理
  - 验证目录分组逻辑

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Final (with F2)
  - **Blocked By**: Task 5, 6

  **Acceptance Criteria**:
  - [ ] batchSize=4 执行 10 个任务全部成功
  - [ ] 无 Maven 编译冲突错误
  - [ ] 工作目录全部清理

  **QA Scenarios**:
  ```
  Scenario: 端到端并行执行
    Tool: Bash
    Preconditions: Java 项目有 10 个可测试文件
    Steps:
      1. dtagent init (初始化项目)
      2. task-create 创建 10 个文件的任务队列
      3. 设置 batchSize=4
      4. task-start 启动执行
      5. 等待全部完成
      6. task-status 检查结果
    Expected Result: 10 个任务全部成功，无冲突错误
    Evidence: .sisyphus/evidence/f1-e2e-parallel.log
  ```

  **Commit**: YES
  - Message: `test: add integration tests for parallel execution`

- [ ] F2. **性能对比测试**

  **What to do**:
  - 对比串行 (batchSize=1) vs 并行 (batchSize=4) 执行时间
  - 记录性能数据
  - 生成测试报告

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Final (with F1)
  - **Blocked By**: F1

  **Acceptance Criteria**:
  - [ ] 并行执行时间 < 串行执行时间 * 0.5
  - [ ] 生成性能对比报告

  **QA Scenarios**:
  ```
  Scenario: 性能对比
    Tool: Bash
    Preconditions: 相同的 8 个测试文件
    Steps:
      1. 记录时间，执行 batchSize=1 串行
      2. 记录时间，执行 batchSize=4 并行
      3. 计算加速比
    Expected Result: 并行时间明显少于串行
    Evidence: .sisyphus/evidence/f2-performance-comparison.log
  ```

  **Commit**: NO (文档报告，不需提交代码)

---

## Commit Strategy

- **Wave 1**: `feat(workspace): add workspace isolation prototype`
- **Wave 2**: `feat(task-manager): integrate workspace isolation for parallel execution`
- **Final**: `test: verify parallel execution performance`

---

## Success Criteria

### Verification Commands

```bash
# 运行原型验证
bun run .sisyphus/scripts/workspace-isolation-prototype.ts

# 运行集成测试
bun test src/core/workspace-manager.test.ts

# 性能对比
# 串行: batchSize=1 执行 10 个任务
# 并行: batchSize=4 执行 10 个任务
# 期望: 并行时间 < 串行时间 * 0.5
```

### Final Checklist

- [ ] 原型验证通过（软链接 + 独立 .m2 可行）
- [ ] batchSize > 1 时无 Maven 冲突
- [ ] 工作目录自动清理
- [ ] Windows 和 Unix 兼容