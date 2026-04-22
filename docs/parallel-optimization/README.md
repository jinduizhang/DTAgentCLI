# 任务队列并行优化

本文档目录包含 DTAgent CLI 任务队列并行优化的完整记录。

## 目录结构

```
docs/parallel-optimization/
├── README.md              # 本文件
├── architecture.md        # 方案架构文档（待更新）
├── changes.md             # 变更记录
├── migration.md           # 迁移指南
└── process.md             # 优化过程记录
```

## 方案演进历史

| 方案 | 状态 | 说明 |
|------|------|------|
| WorkspacePool | 已废弃 | 槽位隔离，复杂度高 |
| async-lock | 向后兼容 | 锁机制，用于 batchSize=1 |
| **Bare Repo Worktree** | **当前方案** | Git Worktree 文件隔离，完全并行 |

## 文档说明

### 📐 [架构文档](./architecture.md)

**内容**: 完整的系统架构设计

**包含**:
- 问题背景与解决方案
- ~~工作空间池设计~~（已废弃）
- ~~锁机制设计~~（向后兼容）
- **Bare Repo Worktree 设计**（当前方案）
- 核心组件设计
- 并行执行流程
- 关键决策说明

**适用对象**: 开发人员、架构师

---

### 📝 [设计文档](../superpowers/specs/2025-04-22-bare-repo-worktree-design.md)

**内容**: Bare Repo Worktree 模式完整设计

**包含**:
- 整体架构设计
- 目录结构设计
- 组件架构设计
- 数据流设计
- 状态机设计
- 错误处理设计

**适用对象**: 开发人员、架构师

---

### 🔄 [迁移指南](./migration.md)

**内容**: 从 WorkspacePool 迁移到 async-lock 的指南（历史）

**适用对象**: 开发人员、运维人员

---

### 🔄 [优化过程](./process.md)

**内容**: 完整的优化过程记录

**包含**:
- 背景分析
- 方案讨论过程
- 原型验证记录
- 核心实现步骤
- 时间线
- 问题与解决
- 经验总结

**适用对象**: 项目管理者、开发人员

---

## 快速开始

### 当前方案：Bare Repo Worktree 模式

> **核心机制**：Git Bare Repository + 动态 Worktree 实现真正的文件系统隔离

**架构**：

```
project/
├── .bare/              # Bare 仓库（原 .git 转换）
├── .git → .bare        # gitdir 指向文件
├── main/               # 主 Worktree（原项目代码）
└── .dtagent/worktrees/ # 动态 Worktree（并行执行时创建）
    ├── group-0-{ts}/   # 组 0 Worktree
    │   ├── .m2/        # 独立 Maven 仓库
    │   ├── src/        # 软链接 → main/src
    │   └── pom.xml     # 软链接 → main/pom.xml
    ├── group-1-{ts}/
    └── group-2-{ts}/
```

**执行流程**：

1. 初始化 Bare Repo（一次性）
2. 文件分组（按 batchSize）
3. 创建 Worktree 组
4. 并行执行所有组（组间并发，组内串行）
5. 合并结果
6. 自动清理 Worktree

### 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| BareRepoInitializer | `initializer.ts` | 一次性仓库转换 |
| FileGrouper | `file-grouper.ts` | 智能文件分组 |
| WorktreePool | `worktree-pool.ts` | Worktree 生命周期管理 |
| GroupExecutor | `group-executor.ts` | 组内串行执行 |
| ResultMerger | `result-merger.ts` | 结果合并与报告 |
| BareRepoOrchestrator | `orchestrator.ts` | 并行调度中心 |

### 使用方法

```bash
# 自动启用：batchSize > 1 且 files.length > batchSize
/task-create dir=src/main/java ext=java batchSize=4 prompt="..."

# 分组策略选择
/task-create dir=src/main/java ext=java batchSize=4 groupingStrategy=by-package prompt="..."

# 简写命令
/generate-dt-dir src/main/java/service --batch-size 4
/mr-ut --base main --batch-size 4
/diff-ut --base main --batch-size 4
```

**分组策略**：

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| round-robin | 简单轮询，均匀分配 | 通用 |
| by-package | 按包路径分组，同包同组 | 减少 Session 上下文切换 |
| by-complexity | 按文件复杂度均衡 | 大文件小文件混合 |

### 与旧方案对比

| 特性 | async-lock（旧） | Bare Repo（新） |
|------|----------------|----------------|
| **并发度** | Session 并发，Maven 串行 | 完全并行（包括 Maven） |
| **隔离级别** | 时间（锁） | 空间（Worktree） |
| **失败隔离** | 无（单点失败影响全部） | 完全隔离（组独立） |
| **磁盘占用** | 低（共享 .m2） | 中（各组独立 .m2） |
| **恢复能力** | 锁自动释放 | Worktree 可独立恢复 |
| **Git 集成** | 无 | 原生支持 |

---

## 验证清单

- [x] Bare Repo 初始化成功
- [x] Worktree 创建成功
- [x] 文件分组正确
- [x] 组间并行执行
- [x] 组内串行执行
- [x] Maven 编译在独立 .m2 中无冲突
- [x] 测试文件自动复制到 main/src/test/
- [x] Worktree 清理成功
- [ ] 性能基准测试

---

## 兼容性

✅ **向后兼容**: batchSize=1 或 files.length <= batchSize 时，使用 async-lock 模式

✅ **自动切换**: 无需配置，系统自动判断使用哪种模式

---

## 贡献者

- 方案设计: DTAgent CLI Team
- 原型验证: DTAgent CLI Team
- 核心实现: DTAgent CLI Team
- 文档编写: DTAgent CLI Team

## 时间线

- **2025-03-26**: WorkspacePool 方案讨论、验证、实现（已废弃）
- **2025-04-06**: async-lock 方案取代 WorkspacePool
- **2025-04-22**: Bare Repo Worktree 方案设计、实现

---

**最后更新**: 2025-04-22  
**方案状态**: Bare Repo Worktree 模式已实现