# Bare Repo Worktree 并发处理架构设计

> **版本**: v1.0  
> **日期**: 2025-04-22  
> **作者**: DTAgent CLI Team  
> **状态**: 设计中

---

## 1. 概述

### 1.1 目标

将 DTAgent CLI 的并行处理架构从 async-lock 锁机制迁移到 **Git Bare Repository + Worktree** 模式，实现真正的文件系统隔离和完全并行执行。

### 1.2 核心收益

- ✅ **完全并行**: 各组之间 Maven 编译完全并行，无锁等待
- ✅ **文件隔离**: 每个 Worktree 独立的文件系统，无冲突
- ✅ **失败隔离**: 单个 Worktree 失败不影响其他组
- ✅ **原生 Git**: 符合 Git 最佳实践，可恢复可追踪
- ✅ **磁盘优化**: 共享 Git objects，仅复制工作文件

### 1.3 范围

| 范围项 | 包含 | 说明 |
|--------|------|------|
| Bare Repo 初始化 | ✅ | 一次性转换现有仓库 |
| Worktree 管理 | ✅ | 动态创建/销毁 |
| 文件分组策略 | ✅ | 智能分组算法 |
| 并行执行引擎 | ✅ | 组间并行，组内串行 |
| 结果聚合 | ✅ | 多 Worktree 结果合并 |
| 生命周期管理 | ✅ | 自动清理和回滚 |
| async-lock 移除 | ✅ | 完全替换旧架构 |
| WorkspacePool 移除 | ✅ | 删除废弃代码 |

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DTAgent CLI 系统                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                        TaskManager Plugin                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │task-create  │  │task-create- │  │ task-start  │  │task-status  │  │   │
│  │  │             │  │files        │  │             │  │             │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────────┘  │   │
│  │         │                │                │                            │   │
│  │         └────────────────┼────────────────┘                            │   │
│  │                          │                                             │   │
│  │                          ▼                                             │   │
│  │              ┌─────────────────────────────┐                         │   │
│  │              │     BareRepoOrchestrator    │                         │   │
│  │              │     (调度中心)               │                         │   │
│  │              └──────────────┬──────────────┘                         │   │
│  │                             │                                         │   │
│  │         ┌───────────────────┼───────────────────┐                     │   │
│  │         │                   │                   │                     │   │
│  │         ▼                   ▼                   ▼                     │   │
│  │  ┌────────────┐     ┌────────────┐     ┌────────────┐            │   │
│  │  │ FileGrouper│     │WorktreePool│     │ResultMerger│            │   │
│  │  │ (文件分组) │     │(Worktree池)│     │(结果合并)  │            │   │
│  │  └──────┬─────┘     └──────┬─────┘     └────────────┘            │   │
│  │         │                  │                                       │   │
│  │         │    ┌─────────────┼─────────────┐                       │   │
│  │         │    │             │             │                         │   │
│  │         ▼    ▼             ▼             ▼                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │   │
│  │  │ Group 0  │ │ Group 1  │ │ Group 2  │ │ Group 3  │              │   │
│  │  │Executor  │ │Executor  │ │Executor  │ │Executor  │              │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘              │   │
│  │       │            │            │            │                     │   │
│  │       ▼            ▼            ▼            ▼                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │   │
│  │  │Worktree 0│ │Worktree 1│ │Worktree 2│ │Worktree 3│              │   │
│  │  │Session   │ │Session   │ │Session   │ │Session   │              │   │
│  │  │Queue     │ │Queue     │ │Queue     │ │Queue     │              │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Bare Repository 结构                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  project-root/                                                                  │
│  ├── .bare/                    # Bare 仓库（原 .git 转换）                    │
│  │   ├── objects/               # Git objects（所有 Worktree 共享）             │
│  │   ├── refs/heads/            # 分支引用                                     │
│  │   │   ├── main               # main 分支                                    │
│  │   │   ├── agent-group-0-*    # 组 0 分支                                    │
│  │   │   ├── agent-group-1-*    # 组 1 分支                                    │
│  │   │   └── ...                                                               │
│  │   ├── refs/remotes/          # 远程分支                                     │
│  │   ├── config                 # Git 配置（bare = true）                     │
│  │   └── ...                                                                   │
│  │                                                                             │
│  ├── .git                      # 文件：gitdir: ./.bare                        │
│  │                                                                             │
│  ├── main/                     # 主 Worktree（原项目代码）                   │
│  │   ├── src/                                                                 │
│  │   ├── pom.xml                                                              │
│  │   └── ...                                                                   │
│  │                                                                             │
│  ├── .dtagent/                 # DTAgent 工作目录                             │
│  │   ├── worktrees/            # 动态 Worktree 目录                           │
│  │   │   ├── group-0-{ts}/     # 组 0 Worktree                                │
│  │   │   │   ├── .git          # 文件 → ../../.bare/worktrees/group-0-{ts}    │
│  │   │   │   ├── .m2/          # 独立 Maven 本地仓库                          │
│  │   │   │   ├── src/          # 软链接 → ../../../main/src                   │
│  │   │   │   ├── pom.xml       # 软链接 → ../../../main/pom.xml               │
│  │   │   │   └── target/       # 独立编译输出                                │
│  │   │   ├── group-1-{ts}/     # 组 1 Worktree                                │
│  │   │   ├── group-2-{ts}/     # 组 2 Worktree                                │
│  │   │   └── group-3-{ts}/     # 组 3 Worktree                                │
│  │   │                                                                        │
│  │   └── logs/                  # 执行日志                                      │
│  │                                                                             │
│  └── ...                        # 其他项目文件                                 │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 组件架构

#### 2.2.1 BareRepoInitializer（初始化器）

```
职责: 一次性将现有 Git 仓库转换为 Bare Repo 结构

┌─────────────────────────────────────────┐
│      BareRepoInitializer                │
├─────────────────────────────────────────┤
│                                         │
│  + initialize(): Promise<void>          │
│    - 检查是否已是 Bare Repo               │
│    - 备份原 .git 目录                     │
│    - 转换为 Bare 仓库                     │
│    - 创建 gitdir 文件                     │
│    - 配置 Git 工作流                      │
│    - 创建 main Worktree                   │
│    - 迁移项目文件                         │
│                                         │
│  + isBareRepo(): boolean                │
│    - 检查 .bare/ 目录是否存在             │
│                                         │
│  + validate(): ValidationResult         │
│    - 验证 Git 状态                        │
│    - 检查工作目录干净                     │
│    - 验证远程仓库                         │
│                                         │
│  + rollback(): Promise<void>            │
│    - 回滚到原状态                         │
│                                         │
└─────────────────────────────────────────┘
```

#### 2.2.2 WorktreePool（Worktree 池管理）

```
职责: 管理 Worktree 的生命周期

┌─────────────────────────────────────────┐
│           WorktreePool                  │
├─────────────────────────────────────────┤
│                                         │
│  worktrees: Map<string, Worktree>       │
│                                         │
│  + createGroup(groupId, files)          │
│    - 创建 Git 分支                        │
│    - 添加 Git Worktree                    │
│    - 设置 Worktree 环境                   │
│    - 创建独立 .m2 目录                    │
│    - 建立软链接                           │
│                                         │
│  + getGroup(groupId): Worktree          │
│    - 获取指定组的 Worktree                 │
│                                         │
│  + listGroups(): Worktree[]             │
│    - 列出所有活动组                        │
│                                         │
│  + destroyGroup(groupId)                │
│    - 移除 Git Worktree                    │
│    - 删除 Git 分支                        │
│    - 清理目录                             │
│                                         │
│  + destroyAll()                         │
│    - 清理所有 Worktree                     │
│                                         │
└─────────────────────────────────────────┘
```

#### 2.2.3 FileGrouper（文件分组器）

```
职责: 将文件列表智能分组

┌─────────────────────────────────────────┐
│           FileGrouper                   │
├─────────────────────────────────────────┤
│                                         │
│  + chunk(files, groupCount): Groups     │
│    - 策略 1: 简单轮询                     │
│    - 策略 2: 按包路径分组                 │
│    - 策略 3: 按文件大小均衡               │
│                                         │
│  + byPackage(files): Groups             │
│    - 同包文件分到同一组                   │
│    - 减少上下文切换                       │
│                                         │
│  + byComplexity(files): Groups          │
│    - 根据文件复杂度分组                   │
│    - 均衡各组执行时间                     │
│                                         │
└─────────────────────────────────────────┘
```

#### 2.2.4 GroupExecutor（组执行器）

```
职责: 在单个 Worktree 内串行执行文件任务

┌─────────────────────────────────────────┐
│          GroupExecutor                  │
├─────────────────────────────────────────┤
│                                         │
│  worktree: Worktree                     │
│  files: string[]                        │
│  currentIndex: number                   │
│                                         │
│  + executeAll(): Promise<Results>       │
│    - 遍历组内所有文件                      │
│    - 为每个文件创建 Session               │
│    - 发送 Prompt 到 Session               │
│    - 等待执行完成                         │
│    - 收集结果                             │
│                                         │
│  + executeFile(file): Promise<Result>   │
│    - 创建 Session                         │
│    - 注入 Worktree 路径                   │
│    - 执行 Maven 命令（并行）               │
│    - 复制生成的测试文件                    │
│                                         │
│  + onComplete(callback)                 │
│    - 组完成回调                           │
│                                         │
└─────────────────────────────────────────┘
```

#### 2.2.5 BareRepoOrchestrator（调度中心）

```
职责: 协调整个并行执行流程

┌─────────────────────────────────────────┐
│      BareRepoOrchestrator               │
├─────────────────────────────────────────┤
│                                         │
│  initializer: BareRepoInitializer       │
│  worktreePool: WorktreePool             │
│  fileGrouper: FileGrouper               │
│  executors: GroupExecutor[]             │
│  resultMerger: ResultMerger             │
│                                         │
│  + start(files, batchSize): Promise<>   │
│    - 初始化 Bare Repo（如需）             │
│    - 分组文件                             │
│    - 创建 Worktree 组                     │
│    - 并行启动所有组                       │
│    - 等待全部完成                         │
│    - 合并结果                             │
│    - 清理 Worktree                        │
│                                         │
│  + stop(): Promise<void>                │
│    - 停止所有执行                         │
│    - 强制清理                             │
│                                         │
│  + getStatus(): OrchestratorStatus      │
│    - 获取执行状态                         │
│                                         │
└─────────────────────────────────────────┘
```

#### 2.2.6 ResultMerger（结果合并器）

```
职责: 合并各 Worktree 的执行结果

┌─────────────────────────────────────────┐
│          ResultMerger                   │
├─────────────────────────────────────────┤
│                                         │
│  + merge(results: GroupResult[]): Result │
│    - 汇总成功/失败统计                    │
│    - 收集所有生成的测试文件               │
│    - 从各 Worktree 复制到主目录            │
│    - 生成执行报告                         │
│                                         │
│  + copyTestFiles(source, target)        │
│    - 递归复制测试文件                     │
│    - 保持包路径结构                       │
│                                         │
│  + generateReport(results): Report      │
│    - 生成 Markdown 格式报告               │
│    - 包含执行时间、成功/失败统计           │
│                                         │
└─────────────────────────────────────────┘
```

### 2.3 数据流架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              执行数据流                                         │
└─────────────────────────────────────────────────────────────────────────────────┘

阶段 1: 初始化（一次性）
═══════════════════════════════════════════════════════════════════════════════════

  原项目状态                    Bare Repo 状态
  ┌──────────┐                ┌──────────┐
  │ project/ │                │ project/ │
  │  ├─ .git/│                │  ├─ .bare/◄────────────┐
  │  ├─ src/ │   ─────►   │  │  ├─ .git ─────────────│
  │  └─ pom  │                │  ├─ main/◄─────────────┤
  │          │                │  │   ├─ src/         │
  │          │                │  │   └─ pom.xml      │
  │          │                │  └─ .dtagent/       │
  │          │                │      └─ worktrees/  │
  └──────────┘                └──────────┘

  转换步骤:
  1. 备份原 .git 目录
  2. 创建 .bare/ 目录
  3. 移动原 .git 内容到 .bare/
  4. 设置 bare = true
  5. 创建 .git 文件（指向 .bare）
  6. 配置 fetch 规则
  7. 创建 main worktree
  8. 迁移项目文件到 main/

阶段 2: 分组与创建
═══════════════════════════════════════════════════════════════════════════════════

  输入: 20 个文件, batchSize=4
  ┌──────────────────────────┐
  │      FileGrouper         │
  │                          │
  │  文件 1-5  → Group 0    │
  │  文件 6-10 → Group 1    │
  │  文件 11-15→ Group 2    │
  │  文件 16-20→ Group 3    │
  └───────────┬──────────────┘
              │
              ▼
  ┌──────────────────────────┐
  │      WorktreePool        │
  │                          │
  │  git branch agent-g0-*   │
  │  git worktree add g0     │
  │  git branch agent-g1-*   │
  │  git worktree add g1     │
  │  git branch agent-g2-*   │
  │  git worktree add g2     │
  │  git branch agent-g3-*   │
  │  git worktree add g3     │
  └───────────┬──────────────┘
              │
              ▼
  ┌──────────────────────────┐
  │    Worktree 结构         │
  │                          │
  │  group-0-{ts}/          │
  │    ├─ .m2/ (独立)       │
  │    ├─ src/ ─────────────┼──► 软链接到 main/src
  │    └─ pom.xml ──────────┼──► 软链接到 main/pom.xml
  │                          │
  │  group-1-{ts}/          │
  │  group-2-{ts}/          │
  │  group-3-{ts}/          │
  └──────────────────────────┘

阶段 3: 并行执行
═══════════════════════════════════════════════════════════════════════════════════

                    ┌──────────────────────────────────┐
                    │     BareRepoOrchestrator         │
                    │                                  │
                    │  ┌─────────┐ ┌─────────┐       │
                    │  │Group 0  │ │Group 1  │       │
                    │  │Executor │ │Executor │       │
                    │  └────┬────┘ └────┬────┘       │
                    │       │           │            │
                    │       ▼           ▼            │
                    │  ┌─────────┐ ┌─────────┐       │
                    │  │Group 2  │ │Group 3  │       │
                    │  │Executor │ │Executor │       │
                    │  └────┬────┘ └────┬────┘       │
                    │       │           │            │
                    │       └─────┬─────┘            │
                    │             │                  │
                    │             ▼                  │
                    │      Parallel Execution        │
                    │      (Promise.all)             │
                    └──────────────────────────────────┘

  每个 GroupExecutor:
  ┌──────────────────────────────────┐
  │  Worktree 组内执行               │
  │                                  │
  │  Session 1 ──► 文件 1 ──► 完成 │
  │     │                            │
  │  Session 2 ──► 文件 2 ──► 完成 │
  │     │                            │
  │  Session 3 ──► 文件 3 ──► 完成 │
  │     │                            │
  │  Session 4 ──► 文件 4 ──► 完成 │
  │     │                            │
  │  Session 5 ──► 文件 5 ──► 完成 │
  │                                  │
  │  组完成 ──► 返回结果            │
  └──────────────────────────────────┘

阶段 4: 结果合并
═══════════════════════════════════════════════════════════════════════════════════

  各 Worktree 结果
  ┌──────────────────────────────────┐
  │  group-0/                        │
  │    src/test/java/A.java          │
  │    src/test/java/B.java          │
  │  group-1/                        │
  │    src/test/java/C.java          │
  │  group-2/                        │
  │    src/test/java/D.java          │
  │  group-3/                        │
  │    src/test/java/E.java          │
  └──────────────┬───────────────────┘
                 │
                 ▼
  ┌──────────────────────────────────┐
  │        ResultMerger              │
  │                                  │
  │  1. 收集所有测试文件             │
  │  2. 复制到 main/src/test/java/   │
  │  3. 生成执行报告                 │
  │  4. 汇总成功/失败统计             │
  └──────────────────────────────────┘

阶段 5: 清理
═══════════════════════════════════════════════════════════════════════════════════

  ┌──────────────────────────────────┐
  │        WorktreePool              │
  │                                  │
  │  git worktree remove group-0     │
  │  git branch -D agent-g0-*        │
  │  git worktree remove group-1     │
  │  git branch -D agent-g1-*        │
  │  git worktree remove group-2     │
  │  git branch -D agent-g2-*        │
  │  git worktree remove group-3     │
  │  git branch -D agent-g3-*        │
  └──────────────────────────────────┘
```

### 2.4 状态机架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Bare Repo 状态机                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

初始化流程:
═══════════

┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   START     │────►│  CHECK_BARE │────►│  VALIDATE   │────►│  CONVERT    │
└─────────────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
                           │                   │                   │
                    ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐
                    │   Is Bare?   │     │  Valid Git?  │     │  Backup .git │
                    │      │       │     │    Status    │     │  Move to     │
                    │   Yes/No     │     │   Clean?     │     │  .bare/      │
                    └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
                           │                   │                   │
                    ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐
                    │ Yes → READY │     │ No → ERROR  │     │ Create gitdir │
                    │ No  → CONVERT│    │ Yes →       │     │ Create main   │
                    └─────────────┘     │   CONVERT   │     │   worktree    │
                                        └─────────────┘     └──────┬──────┘
                                                                   │
                                                            ┌──────┴──────┐
                                                            │  READY      │
                                                            └─────────────┘

执行流程状态:
═════════════

┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   IDLE      │────►│  GROUPING   │────►│  CREATING   │────►│  EXECUTING  │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                   │
                    ┌──────────────────────────────────────────────┼──────────┐
                    │                                              │          │
                    ▼                                              ▼          │
           ┌─────────────┐                              ┌─────────────┐     │
           │   MERGING   │◄─────────────────────────────│   RUNNING   │─────┘
           └──────┬──────┘                              └─────────────┘
                  │
                  ▼
           ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
           │  CLEANUP    │────►│   COMPLETE  │────►│    IDLE     │
           └─────────────┘     └─────────────┘     └─────────────┘

Worktree 状态:
══════════════

┌─────────┐   创建   ┌─────────┐   准备   ┌─────────┐   执行   ┌─────────┐
│ PENDING │─────────►│ CREATED │─────────►│  READY  │─────────►│ RUNNING │
└─────────┘          └─────────┘          └─────────┘          └────┬────┘
                                                                    │
                    ┌───────────────────────────────────────────────┼────────┐
                    │                                               │        │
                    ▼                                               ▼        │
           ┌─────────────┐                                  ┌─────────────┐  │
           │  DESTROYED  │◄─────────────────────────────────│   DONE      │◄─┘
           └─────────────┘   清理                           └─────────────┘

                    ┌───────────────────────────────────────────┐
                    │                   │                      │
                    ▼                   ▼                      ▼
           ┌─────────────┐     ┌─────────────┐       ┌─────────────┐
           │   FAILED    │     │   CANCELLED │       │   ERROR     │
           └─────────────┘     └─────────────┘       └─────────────┘
```

### 2.5 错误处理架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           错误处理策略                                          │
└─────────────────────────────────────────────────────────────────────────────────┘

错误类型层级:
════════════

Level 1: 初始化错误（致命，终止）
────────────────────────────────────
  ├─ Git 状态不干净 → 提示提交或暂存
  ├─ 无远程仓库 → 提示配置远程
  ├─ 磁盘空间不足 → 提示清理空间
  └─ 权限不足 → 提示使用管理员权限

Level 2: Worktree 创建错误（可重试）
────────────────────────────────────
  ├─ 分支创建失败 → 重试或跳过
  ├─ Worktree 添加失败 → 清理残留并重试
  └─ 磁盘已满 → 提示清理后重试

Level 3: 执行错误（隔离，继续）
────────────────────────────────────
  ├─ 单个文件失败 → 记录错误，继续下一个
  ├─ Maven 编译失败 → 记录日志，继续
  ├─ Session 超时 → 标记超时，继续
  └─ 测试生成失败 → 记录原因，继续

Level 4: 清理错误（警告，记录）
────────────────────────────────────
  ├─ Worktree 删除失败 → 记录路径，手动清理
  ├─ 分支删除失败 → 记录分支名，手动删除
  └─ 临时文件残留 → 记录路径，定期清理

错误恢复策略:
══════════════

┌────────────────────────────────────────────────────────────────────────────┐
│                          错误恢复流程                                       │
└────────────────────────────────────────────────────────────────────────────┘

  检测到错误
       │
       ▼
  ┌─────────────┐
  │ 错误分类    │
  └──────┬──────┘
         │
    ┌────┼────┬────────┐
    │    │    │        │
    ▼    ▼    ▼        ▼
  致命  可重试  隔离    警告
  错误  错误   错误    错误
    │    │    │        │
    ▼    ▼    ▼        ▼
  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
  │终止执行│ │重试3次 │ │记录继续│ │记录日志│
  │回滚状态│ │失败跳过│ │        │ │        │
  └────────┘ └────────┘ └────────┘ └────────┘
```

---

## 3. 详细设计

### 3.1 目录结构设计

#### 3.1.1 项目目录结构

```
DTAgentCLI/
├── .bare/                          # Bare 仓库目录
│   ├── objects/                    # Git 对象库
│   ├── refs/heads/                 # 本地分支
│   │   ├── main                    # 主分支
│   │   └── agent-group-{n}-{ts}    # 动态分支
│   ├── refs/remotes/               # 远程分支
│   ├── worktrees/                  # Worktree 元数据
│   │   └── group-{n}-{ts}/         # 各 Worktree 状态
│   ├── config                      # Git 配置
│   └── ...                         # 其他 Git 文件
│
├── .git                            # gitdir 指向文件
│   └── gitdir: ./.bare
│
├── main/                           # 主 Worktree
│   ├── src/                        # 源代码
│   ├── pom.xml                     # Maven 配置
│   └── ...                         # 其他项目文件
│
├── .dtagent/                       # DTAgent 工作目录
│   ├── worktrees/                  # 动态 Worktree 目录
│   │   ├── group-0-{timestamp}/    # 组 0 Worktree
│   │   │   ├── .git                # 指向 .bare 的 gitdir
│   │   │   ├── .m2/                # 独立 Maven 仓库
│   │   │   │   └── repository/     # 依赖缓存
│   │   │   ├── src/                # 软链接 → ../../../main/src
│   │   │   ├── pom.xml             # 软链接 → ../../../main/pom.xml
│   │   │   └── target/             # 独立编译输出
│   │   ├── group-1-{timestamp}/
│   │   └── ...
│   │
│   ├── logs/                       # 执行日志
│   │   ├── bare-repo-init.log      # 初始化日志
│   │   ├── group-{n}-{ts}.log      # 各组执行日志
│   │   └── ...
│   │
│   └── config.json                 # DTAgent 配置
│
├── src/                            # DTAgent CLI 源码
│   ├── core/                       # 核心模块
│   │   ├── bare-repo/
│   │   │   ├── initializer.ts      # Bare Repo 初始化器
│   │   │   ├── worktree-pool.ts    # Worktree 池管理
│   │   │   ├── file-grouper.ts     # 文件分组器
│   │   │   ├── group-executor.ts   # 组执行器
│   │   │   ├── orchestrator.ts     # 调度中心
│   │   │   ├── result-merger.ts    # 结果合并器
│   │   │   ├── lifecycle-manager.ts # 生命周期管理
│   │   │   └── types.ts            # 类型定义
│   │   │
│   │   └── index.ts                # 核心模块导出
│   │
│   └── ...                         # 其他源码
│
├── templates/
│   └── plugins/
│       └── task-manager.ts         # TaskManager 插件（修改）
│
├── docs/
│   └── designs/
│       └── 2025-04-22-bare-repo-worktree-design.md  # 本文档
│
└── ...                             # 其他项目文件
```

#### 3.1.2 Worktree 内部结构

```
.dtagent/worktrees/group-{n}-{timestamp}/
├── .git                                      # gitdir 文件
│   └── gitdir: /path/to/project/.bare/worktrees/group-{n}-{timestamp}
│
├── .m2/                                      # 独立 Maven 本地仓库
│   └── repository/
│       ├── com/
│       ├── org/
│       └── ...
│
├── src/                                      # 软链接到主项目 src
│   └── main/java/                            # 实际指向 ../../../main/src/main/java
│
├── pom.xml                                   # 软链接到主项目 pom.xml
│   └── -> ../../../main/pom.xml
│
└── target/                                   # 独立编译输出
    ├── classes/
    ├── test-classes/
    ├── surefire-reports/
    └── ...
```

### 3.2 核心类设计

#### 3.2.1 类型定义

```typescript
// src/core/bare-repo/types.ts

/**
 * Worktree 配置
 */
export interface WorktreeConfig {
  /** Worktree ID */
  id: string;
  /** Worktree 路径 */
  path: string;
  /** 关联的 Git 分支 */
  branch: string;
  /** 独立 .m2 路径 */
  m2Path: string;
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * 文件组
 */
export interface FileGroup {
  /** 组 ID */
  id: number;
  /** 组内文件列表 */
  files: string[];
  /** 关联的 Worktree */
  worktree?: WorktreeConfig;
  /** 组状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 执行结果 */
  results?: FileResult[];
}

/**
 * 单个文件执行结果
 */
export interface FileResult {
  /** 文件名 */
  filename: string;
  /** 是否成功 */
  success: boolean;
  /** Session ID */
  sessionId?: string;
  /** 执行摘要 */
  summary?: string;
  /** 错误信息 */
  error?: string;
  /** 执行时长（毫秒） */
  duration?: number;
}

/**
 * 组执行结果
 */
export interface GroupResult {
  /** 组 ID */
  groupId: number;
  /** Worktree 路径 */
  worktreePath: string;
  /** 组内文件结果 */
  fileResults: FileResult[];
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 是否全部成功 */
  allSuccess: boolean;
}

/**
 * 执行配置
 */
export interface ExecutionConfig {
  /** 项目根目录 */
  projectRoot: string;
  /** 并行组数 */
  batchSize: number;
  /** 分组策略 */
  groupingStrategy: 'round-robin' | 'by-package' | 'by-complexity';
  /** 是否自动清理 */
  autoCleanup: boolean;
  /** 超时时间（毫秒） */
  timeout: number;
}

/**
 * 初始化结果
 */
export interface InitializationResult {
  /** 是否成功 */
  success: boolean;
  /** Bare Repo 路径 */
  barePath?: string;
  /** 主 Worktree 路径 */
  mainWorktreePath?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 执行状态
 */
export interface ExecutionStatus {
  /** 状态 */
  state: 'idle' | 'grouping' | 'creating' | 'executing' | 'merging' | 'cleaning' | 'completed';
  /** 总组数 */
  totalGroups: number;
  /** 已完成组数 */
  completedGroups: number;
  /** 进行中组数 */
  runningGroups: number;
  /** 失败组数 */
  failedGroups: number;
  /** 各组状态 */
  groupStatuses: GroupStatus[];
}

/**
 * 组状态
 */
export interface GroupStatus {
  /** 组 ID */
  groupId: number;
  /** 状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 当前执行文件 */
  currentFile?: string;
  /** 已执行文件数 */
  processedCount: number;
  /** 总文件数 */
  totalCount: number;
  /** 开始时间 */
  startTime?: number;
  /** 预计完成时间 */
  estimatedEndTime?: number;
}
```

#### 3.2.2 BareRepoInitializer

```typescript
// src/core/bare-repo/initializer.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { InitializationResult } from './types';

/**
 * Bare Repository 初始化器
 * 
 * 负责将普通 Git 仓库转换为 Bare Repository 结构
 * 此过程是一次性的，转换后不可回退
 */
export class BareRepoInitializer {
  private projectRoot: string;
  private barePath: string;
  private gitFile: string;
  private mainWorktreePath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.barePath = path.join(projectRoot, '.bare');
    this.gitFile = path.join(projectRoot, '.git');
    this.mainWorktreePath = path.join(projectRoot, 'main');
  }

  /**
   * 检查是否已是 Bare Repository
   */
  isBareRepo(): boolean {
    return fs.existsSync(this.barePath) && fs.statSync(this.barePath).isDirectory();
  }

  /**
   * 验证是否可转换为 Bare Repo
   */
  validate(): { valid: boolean; reason?: string } {
    // 检查是否是 Git 仓库
    const gitDir = path.join(this.projectRoot, '.git');
    if (!fs.existsSync(gitDir)) {
      return { valid: false, reason: 'Not a Git repository' };
    }

    // 检查是否有未提交的更改
    try {
      const status = execSync('git status --porcelain', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      });
      if (status.trim()) {
        return { valid: false, reason: 'Working directory not clean. Please commit or stash changes.' };
      }
    } catch (error) {
      return { valid: false, reason: 'Failed to check Git status' };
    }

    // 检查是否有远程仓库
    try {
      execSync('git remote get-url origin', {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });
    } catch (error) {
      return { valid: false, reason: 'No remote repository configured' };
    }

    return { valid: true };
  }

  /**
   * 执行转换为 Bare Repository
   */
  async initialize(): Promise<InitializationResult> {
    // 如果已是 Bare Repo，直接返回
    if (this.isBareRepo()) {
      return {
        success: true,
        barePath: this.barePath,
        mainWorktreePath: this.mainWorktreePath
      };
    }

    // 验证
    const validation = this.validate();
    if (!validation.valid) {
      return {
        success: false,
        error: validation.reason
      };
    }

    try {
      // 1. 获取当前分支
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      }).trim();

      // 2. 备份原 .git 目录
      const backupPath = `${this.gitFile}.backup`;
      fs.renameSync(this.gitFile, backupPath);

      try {
        // 3. 创建 .bare 目录
        fs.mkdirSync(this.barePath, { recursive: true });

        // 4. 移动备份内容到 .bare
        fs.renameSync(backupPath, this.barePath);

        // 5. 更新 Git 配置为 bare
        const configPath = path.join(this.barePath, 'config');
        let config = fs.readFileSync(configPath, 'utf8');
        if (!config.includes('bare = true')) {
          config = config.replace(/\[core\]/, '[core]\n    bare = true');
          fs.writeFileSync(configPath, config);
        }

        // 6. 创建 .git 文件（不是目录）
        fs.writeFileSync(this.gitFile, 'gitdir: ./.bare\n');

        // 7. 配置 fetch 规则
        execSync('git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"', {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });

        // 8. 启用相对路径
        execSync('git config worktree.useRelativePaths true', {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });

        // 9. 创建 main Worktree
        execSync(`git worktree add main ${currentBranch}`, {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });

        // 10. 清理主 worktree 中的 .git（如果是目录）
        const mainGitPath = path.join(this.mainWorktreePath, '.git');
        if (fs.existsSync(mainGitPath)) {
          const stats = fs.statSync(mainGitPath);
          if (stats.isDirectory()) {
            fs.rmSync(mainGitPath, { recursive: true });
          }
        }

        console.log('[BareRepoInitializer] Successfully converted to bare repository');
        console.log(`[BareRepoInitializer] Main worktree: ${this.mainWorktreePath}`);

        return {
          success: true,
          barePath: this.barePath,
          mainWorktreePath: this.mainWorktreePath
        };

      } catch (error) {
        // 回滚
        if (fs.existsSync(this.barePath)) {
          fs.rmSync(this.barePath, { recursive: true });
        }
        if (fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, this.gitFile);
        }
        throw error;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[BareRepoInitializer] Failed to initialize:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 获取 Bare Repo 信息
   */
  getInfo(): { barePath: string; mainWorktreePath: string } | null {
    if (!this.isBareRepo()) {
      return null;
    }
    return {
      barePath: this.barePath,
      mainWorktreePath: this.mainWorktreePath
    };
  }
}
```

#### 3.2.3 WorktreePool

```typescript
// src/core/bare-repo/worktree-pool.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { WorktreeConfig, FileGroup } from './types';

/**
 * Worktree 池管理器
 * 
 * 管理动态 Worktree 的创建、使用和销毁
 */
export class WorktreePool {
  private projectRoot: string;
  private barePath: string;
  private worktreesDir: string;
  private worktrees: Map<string, WorktreeConfig> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.barePath = path.join(projectRoot, '.bare');
    this.worktreesDir = path.join(projectRoot, '.dtagent', 'worktrees');
  }

  /**
   * 为文件组创建 Worktree
   */
  async createGroupWorktree(groupId: number): Promise<WorktreeConfig> {
    const timestamp = Date.now();
    const branchName = `agent-group-${groupId}-${timestamp}`;
    const worktreeName = `group-${groupId}-${timestamp}`;
    const worktreePath = path.join(this.worktreesDir, worktreeName);
    const m2Path = path.join(worktreePath, '.m2');

    try {
      // 确保工作目录存在
      fs.mkdirSync(this.worktreesDir, { recursive: true });

      // 1. 创建新分支（基于 main）
      execSync(`git branch ${branchName} main`, {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      // 2. 创建 Worktree
      execSync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      // 3. 移除自动创建的目录结构（保留 .git 文件）
      // 清理后将重新建立软链接
      const autoCreatedSrc = path.join(worktreePath, 'src');
      const autoCreatedPom = path.join(worktreePath, 'pom.xml');
      
      if (fs.existsSync(autoCreatedSrc)) {
        fs.rmSync(autoCreatedSrc, { recursive: true });
      }
      if (fs.existsSync(autoCreatedPom)) {
        fs.unlinkSync(autoCreatedPom);
      }

      // 4. 创建独立的 .m2 目录
      fs.mkdirSync(m2Path, { recursive: true });
      fs.mkdirSync(path.join(m2Path, 'repository'), { recursive: true });

      // 5. 建立软链接
      const mainPath = path.join(this.projectRoot, 'main');
      
      // src 目录软链接
      const relativeSrcPath = path.relative(worktreePath, path.join(mainPath, 'src'));
      fs.symlinkSync(relativeSrcPath, path.join(worktreePath, 'src'), 'junction');

      // pom.xml 软链接
      const relativePomPath = path.relative(worktreePath, path.join(mainPath, 'pom.xml'));
      fs.symlinkSync(relativePomPath, path.join(worktreePath, 'pom.xml'), 'file');

      // 6. 创建独立的 target 目录（实际目录，非软链接）
      fs.mkdirSync(path.join(worktreePath, 'target'), { recursive: true });

      const worktree: WorktreeConfig = {
        id: worktreeName,
        path: worktreePath,
        branch: branchName,
        m2Path,
        createdAt: timestamp
      };

      this.worktrees.set(worktreeName, worktree);
      
      console.log(`[WorktreePool] Created worktree: ${worktreeName} at ${worktreePath}`);
      
      return worktree;

    } catch (error) {
      // 清理失败的创建
      await this.cleanupFailedCreation(worktreePath, branchName);
      throw error;
    }
  }

  /**
   * 清理失败的 Worktree 创建
   */
  private async cleanupFailedCreation(worktreePath: string, branchName: string): Promise<void> {
    try {
      // 移除 Worktree
      if (fs.existsSync(worktreePath)) {
        execSync(`git worktree remove "${worktreePath}" --force`, {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });
      }
      
      // 删除分支
      try {
        execSync(`git branch -D ${branchName}`, {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });
      } catch (e) {
        // 分支可能不存在，忽略错误
      }
    } catch (e) {
      console.error('[WorktreePool] Cleanup failed:', e);
    }
  }

  /**
   * 获取 Worktree
   */
  getWorktree(worktreeId: string): WorktreeConfig | undefined {
    return this.worktrees.get(worktreeId);
  }

  /**
   * 列出所有 Worktree
   */
  listWorktrees(): WorktreeConfig[] {
    return Array.from(this.worktrees.values());
  }

  /**
   * 销毁指定 Worktree
   */
  async destroyWorktree(worktreeId: string): Promise<void> {
    const worktree = this.worktrees.get(worktreeId);
    if (!worktree) {
      console.warn(`[WorktreePool] Worktree ${worktreeId} not found`);
      return;
    }

    try {
      // 1. 移除 Git Worktree
      execSync(`git worktree remove "${worktree.path}" --force`, {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      // 2. 删除分支
      try {
        execSync(`git branch -D ${worktree.branch}`, {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });
      } catch (e) {
        console.warn(`[WorktreePool] Failed to delete branch ${worktree.branch}:`, e);
      }

      // 3. 从映射中移除
      this.worktrees.delete(worktreeId);

      console.log(`[WorktreePool] Destroyed worktree: ${worktreeId}`);

    } catch (error) {
      console.error(`[WorktreePool] Failed to destroy worktree ${worktreeId}:`, error);
      throw error;
    }
  }

  /**
   * 销毁所有 Worktree
   */
  async destroyAll(): Promise<void> {
    const worktreeIds = Array.from(this.worktrees.keys());
    
    console.log(`[WorktreePool] Destroying ${worktreeIds.length} worktrees...`);
    
    const errors: string[] = [];
    
    for (const worktreeId of worktreeIds) {
      try {
        await this.destroyWorktree(worktreeId);
      } catch (error) {
        errors.push(worktreeId);
      }
    }

    if (errors.length > 0) {
      console.warn(`[WorktreePool] Failed to destroy ${errors.length} worktrees:`, errors);
    }

    // 清理 .dtagent/worktrees 目录
    if (fs.existsSync(this.worktreesDir)) {
      fs.rmSync(this.worktreesDir, { recursive: true });
    }
  }
}
```

#### 3.2.4 FileGrouper

```typescript
// src/core/bare-repo/file-grouper.ts

import * as fs from 'fs';
import * as path from 'path';
import { FileGroup } from './types';

/**
 * 文件分组策略枚举
 */
export enum GroupingStrategy {
  /** 简单轮询 */
  ROUND_ROBIN = 'round-robin',
  /** 按包路径分组 */
  BY_PACKAGE = 'by-package',
  /** 按文件复杂度 */
  BY_COMPLEXITY = 'by-complexity'
}

/**
 * 文件分组器
 * 
 * 将文件列表智能分组，用于并行执行
 */
export class FileGrouper {
  /**
   * 执行分组
   */
  static group(
    files: string[],
    groupCount: number,
    strategy: GroupingStrategy = GroupingStrategy.ROUND_ROBIN
  ): FileGroup[] {
    switch (strategy) {
      case GroupingStrategy.ROUND_ROBIN:
        return this.roundRobin(files, groupCount);
      case GroupingStrategy.BY_PACKAGE:
        return this.byPackage(files, groupCount);
      case GroupingStrategy.BY_COMPLEXITY:
        return this.byComplexity(files, groupCount);
      default:
        return this.roundRobin(files, groupCount);
    }
  }

  /**
   * 简单轮询策略
   * 将文件按顺序均匀分配到各组
   */
  private static roundRobin(files: string[], groupCount: number): FileGroup[] {
    const groups: FileGroup[] = [];
    
    // 初始化组
    for (let i = 0; i < groupCount; i++) {
      groups.push({
        id: i,
        files: [],
        status: 'pending'
      });
    }

    // 轮询分配
    files.forEach((file, index) => {
      const groupIndex = index % groupCount;
      groups[groupIndex].files.push(file);
    });

    // 过滤空组
    return groups.filter(g => g.files.length > 0);
  }

  /**
   * 按包路径分组策略
   * 将同包文件分到同一组，减少上下文切换
   */
  private static byPackage(files: string[], groupCount: number): FileGroup[] {
    // 按包路径分组
    const packageGroups = new Map<string, string[]>();
    
    files.forEach(file => {
      const packagePath = this.extractPackagePath(file);
      if (!packageGroups.has(packagePath)) {
        packageGroups.set(packagePath, []);
      }
      packageGroups.get(packagePath)!.push(file);
    });

    // 将包分组分配到 Worktree 组
    const groups: FileGroup[] = [];
    let currentGroupId = 0;
    let currentGroup: FileGroup = { id: currentGroupId, files: [], status: 'pending' };

    const sortedPackages = Array.from(packageGroups.entries())
      .sort((a, b) => b[1].length - a[1].length);

    for (const [packagePath, packageFiles] of sortedPackages) {
      // 如果当前组已满，创建新组
      if (currentGroup.files.length >= Math.ceil(files.length / groupCount)) {
        if (currentGroup.files.length > 0) {
          groups.push(currentGroup);
        }
        currentGroupId++;
        currentGroup = { id: currentGroupId, files: [], status: 'pending' };
      }

      // 将整包文件添加到当前组
      currentGroup.files.push(...packageFiles);
    }

    // 添加最后一组
    if (currentGroup.files.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * 按文件复杂度分组策略
   * 根据文件大小和行数均衡分配
   */
  private static byComplexity(files: string[], groupCount: number): FileGroup[] {
    // 计算每个文件的复杂度
    const fileComplexities = files.map(file => ({
      file,
      complexity: this.calculateComplexity(file)
    }));

    // 按复杂度降序排序
    fileComplexities.sort((a, b) => b.complexity - a.complexity);

    // 初始化组复杂度
    const groups: FileGroup[] = [];
    const groupComplexities: number[] = [];
    
    for (let i = 0; i < groupCount; i++) {
      groups.push({ id: i, files: [], status: 'pending' });
      groupComplexities.push(0);
    }

    // 贪心分配：每次将最复杂的文件分配到当前总复杂度最低的组
    for (const { file, complexity } of fileComplexities) {
      const minComplexityGroup = groupComplexities.indexOf(Math.min(...groupComplexities));
      groups[minComplexityGroup].files.push(file);
      groupComplexities[minComplexityGroup] += complexity;
    }

    return groups.filter(g => g.files.length > 0);
  }

  /**
   * 提取包路径
   */
  private static extractPackagePath(file: string): string {
    // 假设路径格式: src/main/java/com/example/Service.java
    const parts = file.split('/');
    const javaIndex = parts.indexOf('java');
    if (javaIndex >= 0 && javaIndex < parts.length - 1) {
      return parts.slice(0, javaIndex + 1).join('/');
    }
    return path.dirname(file);
  }

  /**
   * 计算文件复杂度
   */
  private static calculateComplexity(file: string): number {
    try {
      const stats = fs.statSync(file);
      // 简单策略：文件大小作为复杂度指标
      return stats.size;
    } catch (e) {
      return 1;
    }
  }
}
```

### 3.3 时序设计

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         执行时序图                                             │
└─────────────────────────────────────────────────────────────────────────────────┘

用户              TaskManager          BareRepoOrchestrator        WorktreePool
 │                      │                       │                       │
 │──task-create───────►│                       │                       │
 │                      │                       │                       │
 │──task-start────────►│                       │                       │
 │                      │                       │                       │
 │                      │──initialize()──────►│                       │
 │                      │                     │──isBareRepo()────────►│
 │                      │                     │◄────Yes──────────────│
 │                      │                     │                       │
 │                      │◄──initialized──────│                       │
 │                      │                     │                       │
 │                      │──groupFiles()────►│                       │
 │                      │                     │                       │
 │                      │──createGroups()──►│                       │
 │                      │                     │──createGroup(0)────►│
 │                      │                     │◄──worktree-0─────────│
 │                      │                     │──createGroup(1)────►│
 │                      │                     │◄──worktree-1─────────│
 │                      │                     │──createGroup(2)────►│
 │                      │                     │◄──worktree-2─────────│
 │                      │                     │──createGroup(3)────►│
 │                      │                     │◄──worktree-3─────────│
 │                      │                     │                       │
 │                      │◄──groups-ready─────│                       │
 │                      │                     │                       │
 │◄──queue-started─────│                     │                       │
 │                      │                     │                       │
 │                      │──executeParallel()─►│                       │
 │                      │                     │                       │
 │                      │                     │──────executeGroup(0)──┼──►
 │                      │                     │──────executeGroup(1)──┼──►
 │                      │                     │──────executeGroup(2)──┼──►
 │                      │                     │──────executeGroup(3)──┼──►
 │                      │                     │                       │
 │                      │                     │◄─────group-0-complete─│
 │                      │                     │◄─────group-1-complete─│
 │                      │                     │◄─────group-2-complete─│
 │                      │                     │◄─────group-3-complete─│
 │                      │                     │                       │
 │                      │◄──all-complete─────│                       │
 │                      │                     │                       │
 │                      │──mergeResults()──►│                       │
 │                      │                     │                       │
 │                      │◄──results-merged───│                       │
 │                      │                     │                       │
 │◄──completed─────────│                     │                       │
 │                      │                     │                       │
 │──task-status───────►│                     │                       │
 │                      │                     │                       │
 │◄──status────────────│                     │                       │
 │                      │                     │                       │
```

---

## 4. 接口设计

### 4.1 TaskManager 插件接口

```typescript
// TaskManager 插件 Bare Repo 模式接口

interface TaskManagerConfig {
  /** 执行模式 */
  mode: 'async-lock' | 'bare-repo';
  /** 并行组数 */
  batchSize: number;
  /** 分组策略 */
  groupingStrategy?: 'round-robin' | 'by-package' | 'by-complexity';
  /** 是否自动清理 */
  autoCleanup?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
}

// 修改 task-create 命令，支持模式选择
{
  "task-create": {
    args: {
      dir: "string",
      ext: "string",
      recursive: "boolean",
      prompt: "string",
      batchSize: "number",
      mode: "'async-lock' | 'bare-repo'",  // 新增
      groupingStrategy: "'round-robin' | 'by-package' | 'by-complexity'"  // 新增
    }
  }
}
```

### 4.2 BareRepoOrchestrator 公共 API

```typescript
// src/core/bare-repo/orchestrator.ts

export class BareRepoOrchestrator {
  /**
   * 开始执行
   * @param files 文件列表
   * @param config 执行配置
   * @returns 执行结果
   */
  async execute(
    files: string[],
    config: ExecutionConfig
  ): Promise<GroupResult[]>;

  /**
   * 停止执行
   */
  async stop(): Promise<void>;

  /**
   * 获取执行状态
   */
  getStatus(): ExecutionStatus;

  /**
   * 初始化 Bare Repo（如果不存在）
   */
  async initialize(): Promise<InitializationResult>;
}
```

---

## 5. 配置设计

### 5.1 DTAgent 配置

```json
// .dtagent/config.json
{
  "parallel": {
    "mode": "bare-repo",  // 新增: async-lock | bare-repo
    "batchSize": 4,
    "groupingStrategy": "round-robin",
    "autoCleanup": true,
    "timeout": 300000  // 5分钟
  },
  "bareRepo": {
    "enabled": true,
    "initialized": true,
    "mainWorktree": "main",
    "worktreesDir": ".dtagent/worktrees"
  }
}
```

### 5.2 环境变量

```bash
# 可选：强制使用特定模式
DTAGENT_PARALLEL_MODE=bare-repo  # 或 async-lock

# 可选：分组策略
DTAGENT_GROUPING_STRATEGY=by-package

# 可选：调试模式
DTAGENT_BARE_REPO_DEBUG=true
```

---

## 6. 错误处理与恢复

### 6.1 错误分类与处理

| 错误类型 | 示例 | 处理方式 | 用户提示 |
|---------|------|---------|---------|
| **初始化错误** | Git 状态不干净 | 终止，提示用户 | "请先提交或暂存更改" |
| **创建错误** | Worktree 创建失败 | 重试 3 次，失败跳过 | "组 {n} 创建失败，跳过" |
| **执行错误** | Maven 编译失败 | 记录日志，继续下一个 | "文件 {x} 编译失败" |
| **合并错误** | 复制文件失败 | 记录警告，继续 | "部分文件未合并" |
| **清理错误** | Worktree 删除失败 | 记录路径，手动清理 | "请手动删除 {path}" |

### 6.2 恢复机制

```typescript
// src/core/bare-repo/recovery-manager.ts

export class RecoveryManager {
  /**
   * 检查并恢复异常状态
   */
  async checkAndRecover(): Promise<RecoveryResult> {
    // 1. 检查残留的 Worktree
    // 2. 检查残留的临时分支
    // 3. 清理孤儿 Worktree
    // 4. 返回恢复报告
  }

  /**
   * 紧急清理
   */
  async emergencyCleanup(): Promise<void> {
    // 强制删除所有 Worktree
    // 强制删除所有临时分支
  }
}
```

---

## 7. 性能考虑

### 7.1 性能对比

| 指标 | async-lock | Bare Repo | 提升 |
|-----|-----------|-----------|------|
| 并发度 | 串行 Maven | 完全并行 | **4x** |
| 创建开销 | 无 | ~500ms/组 | - |
| 磁盘占用 | 低 | 中（各组独立 .m2）| - |
| 失败隔离 | 无 | 完全隔离 | ✅ |

### 7.2 优化策略

1. **Worktree 预热**: 首次创建后保留，下次复用
2. **.m2 缓存共享**: 定期从主仓库同步依赖
3. **增量执行**: 只处理变更的文件
4. **智能分组**: 根据文件复杂度动态调整组大小

---

## 8. 安全考虑

### 8.1 安全策略

1. **Git 钩子**: 在 Bare Repo 转换前备份
2. **权限检查**: 确保有 Git 操作权限
3. **磁盘空间**: 检查可用空间 > 1GB
4. **清理保障**: 即使失败也尝试清理

---

## 9. 测试策略

### 9.1 测试覆盖

| 测试类型 | 覆盖内容 |
|---------|---------|
| **单元测试** | BareRepoInitializer, WorktreePool, FileGrouper |
| **集成测试** | 完整执行流程，错误恢复 |
| **E2E 测试** | 真实 Maven 项目执行 |
| **压力测试** | 100+ 文件，大量 Worktree |

### 9.2 测试场景

1. 首次初始化 Bare Repo
2. 重复初始化（幂等）
3. 创建多个 Worktree
4. 并发执行多个组
5. 部分组失败
6. 手动停止
7. 异常清理

---

## 10. 部署与迁移

### 10.1 迁移步骤

1. **备份**: 备份现有项目
2. **更新**: 更新 DTAgent CLI
3. **初始化**: 运行 `dtagent init --bare-repo`
4. **验证**: 执行测试任务验证
5. **清理**: 删除 async-lock 相关代码

### 10.2 回滚方案

如果需要回滚到 async-lock：

1. 修改配置 `"mode": "async-lock"`
2. 可选：将 Bare Repo 转换回普通仓库

---

## 11. 文档清单

| 文档 | 状态 | 路径 |
|-----|------|------|
| 架构设计 | ✅ | `docs/designs/2025-04-22-bare-repo-worktree-design.md` |
| API 文档 | 🔄 | `docs/api/bare-repo-api.md` |
| 迁移指南 | 🔄 | `docs/migration/bare-repo-migration.md` |
| 故障排查 | 🔄 | `docs/troubleshooting/bare-repo-issues.md` |

---

## 12. 附录

### 12.1 Git 命令参考

```bash
# 转换为 Bare Repo
# 1. 备份
mv .git .git.backup

# 2. 创建 .bare
mkdir .bare
mv .git.backup/* .bare/

# 3. 创建 gitdir 文件
echo "gitdir: ./.bare" > .git

# 4. 配置
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git config worktree.useRelativePaths true

# 5. 创建 main worktree
git worktree add main main

# 创建新的 Worktree
git branch agent-group-0-{timestamp} main
git worktree add .dtagent/worktrees/group-0-{timestamp} agent-group-0-{timestamp}

# 删除 Worktree
git worktree remove .dtagent/worktrees/group-0-{timestamp}
git branch -D agent-group-0-{timestamp}

# 列出 Worktrees
git worktree list
```

### 12.2 相关链接

- [Git Worktree 文档](https://git-scm.com/docs/git-worktree)
- [Bare Repository 文档](https://git-scm.com/book/en/v2/Git-on-the-Server-Getting-Git-on-a-Server)
- [Ahmed El Gabri - Git Worktrees Done Right](https://gabri.me/blog/git-worktrees-done-right)
- [GitWorktree.org](https://www.gitworktree.org/)

---

**文档结束**
