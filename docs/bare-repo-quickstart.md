# Bare Repo Worktree 快速入门

## 概述

Bare Repo Worktree 模式为 DTAgent CLI 提供真正的并行执行能力，通过 Git Worktree 实现文件系统隔离。

## 自动启用

无需配置，系统会自动检测并启用：

```typescript
// 自动判断条件
if (batchSize > 1 && files.length > batchSize) {
  // 使用 Bare Repo Worktree 模式
} else {
  // 使用 async-lock 模式（向后兼容）
}
```

## 目录结构

转换后的目录结构：

```
project/
├── .bare/              # Bare Git 仓库（原 .git 转换）
├── .git → .bare        # gitdir 指向文件
├── main/               # 主 Worktree（原项目代码）
│   ├── src/
│   ├── pom.xml
│   └── ...
└── .dtagent/
    ├── worktrees/      # 动态 Worktree（执行时创建）
    │   ├── group-0-{timestamp}/
    │   │   ├── .git    # 指向 .bare 的 gitdir
    │   │   ├── .m2/    # 独立 Maven 仓库
    │   │   ├── src/    # 软链接 → main/src
    │   │   ├── pom.xml # 软链接 → main/pom.xml
    │   │   └── target/ # 独立编译输出
    │   ├── group-1-{timestamp}/
    │   └── ...
    └── reports/        # 执行报告
```

## 手动初始化（可选）

如果需要手动初始化 Bare Repo：

```typescript
import { BareRepoInitializer } from './src/core/bare-repo';

const initializer = new BareRepoInitializer('/path/to/project');
const result = await initializer.initialize();

if (result.success) {
  console.log('Bare Repo 路径:', result.barePath);
  console.log('主 Worktree:', result.mainWorktreePath);
}
```

## 使用示例

### 基础用法

```bash
# 自动启用 Bare Repo 模式
/task-create dir=src/main/java ext=java batchSize=4 prompt="生成单元测试"

# 启动执行
/task-start

# 查看状态
/task-status

# 停止执行（会自动清理 Worktree）
/task-stop
```

### 分组策略选择

```bash
# 轮询分组（默认）
/task-create dir=src/main/java ext=java batchSize=4 groupingStrategy=round-robin prompt="..."

# 按包路径分组（减少上下文切换）
/task-create dir=src/main/java ext=java batchSize=4 groupingStrategy=by-package prompt="..."

# 按复杂度分组（均衡执行时间）
/task-create dir=src/main/java ext=java batchSize=4 groupingStrategy=by-complexity prompt="..."
```

### 简写命令

```bash
/generate-dt-dir src/main/java/service --batch-size 4
/mr-ut --base main --batch-size 4
/diff-ut --base main --batch-size 4
```

## 核心概念

### 1. Bare Repository

Bare Repository 是不含工作文件的 Git 仓库，只包含 Git 元数据（`.git` 内容）。

```
普通仓库: .git/ + 工作文件
Bare 仓库: 只有 .git 内容（无工作文件）
```

### 2. Git Worktree

Worktree 允许在同一个仓库中同时检出多个分支到不同目录。

```
git worktree add main main              # 创建 main 分支的 worktree
git worktree add feature feature-branch # 创建 feature 分支的 worktree
git worktree list                       # 列出所有 worktree
git worktree remove feature             # 删除 worktree
```

### 3. 文件隔离

每个 Worktree 拥有：
- 独立的 `.m2` Maven 仓库（避免并发编译冲突）
- 软链接到 `src` 和 `pom.xml`（共享源代码）
- 独立的 `target` 目录（避免输出冲突）

### 4. 执行流程

```
┌─────────────────────────────────────────────────┐
│  并行执行                                        │
│                                                  │
│  Group 0 ──────► 文件 1, 2, 3 （串行执行）        │
│     │                                            │
│  Group 1 ──────► 文件 4, 5, 6 （串行执行）        │
│     │                                            │
│  Group 2 ──────► 文件 7, 8, 9 （串行执行）        │
│     │                                            │
│  Group 3 ──────► 文件 10, 11, 12 （串行执行）     │
│                                                  │
│  所有组并行执行，组内串行执行                      │
└─────────────────────────────────────────────────┘
```

## API 参考

### BareRepoInitializer

```typescript
class BareRepoInitializer {
  constructor(projectRoot: string);
  
  isBareRepo(): boolean;                    // 检查是否已是 Bare Repo
  validate(): ValidationResult;             // 验证是否可转换
  initialize(): Promise<InitializationResult>; // 执行转换
  getInfo(): BareRepoInfo | null;           // 获取信息
}
```

### FileGrouper

```typescript
class FileGrouper {
  static group(
    files: string[],
    groupCount: number,
    strategy?: GroupingStrategy
  ): FileGroup[];
}

enum GroupingStrategy {
  ROUND_ROBIN = 'round-robin',     // 轮询
  BY_PACKAGE = 'by-package',       // 按包
  BY_COMPLEXITY = 'by-complexity'  // 按复杂度
}
```

### WorktreePool

```typescript
class WorktreePool {
  constructor(projectRoot: string);
  
  createGroupWorktree(groupId: number): Promise<WorktreeConfig>;
  listWorktrees(): WorktreeConfig[];
  destroyWorktree(worktreeId: string): Promise<void>;
  destroyAll(): Promise<void>;
}
```

### BareRepoOrchestrator

```typescript
class BareRepoOrchestrator {
  constructor(config: ExecutionConfig);
  
  initialize(): Promise<boolean>;
  execute(
    files: string[],
    executeFileFn: (file: string, worktree: WorktreeConfig) => Promise<FileResult>
  ): Promise<GroupResult[]>;
  stop(): Promise<void>;
  getStatus(): ExecutionStatus;
}
```

## 故障排除

### 问题：Working directory not clean

**原因**: Bare Repo 转换要求干净的工作目录

**解决**:
```bash
git add .
git commit -m "Prepare for bare repo conversion"
```

### 问题：Worktree 创建失败

**原因**: Git 版本过低或权限不足

**解决**:
```bash
# 检查 Git 版本（需要 >= 2.5）
git --version

# Windows: 确保开发者模式已启用（支持符号链接）
```

### 问题：Maven 编译冲突

**原因**: 未使用独立 `.m2` 目录

**解决**: 确保在 Worktree 中使用 `-Dmaven.repo.local` 参数

### 问题：Worktree 清理失败

**原因**: 进程中断或异常退出

**解决**:
```bash
# 手动清理
git worktree prune
git branch --list 'agent-group-*' | xargs git branch -D
rm -rf .dtagent/worktrees/
```

## 性能优化

### 依赖缓存

首次执行时，每个 Worktree 会下载依赖到独立的 `.m2`。后续执行时，依赖已缓存，编译速度更快。

### 预热 Worktree

可以预先创建 Worktree，后续任务直接使用：

```typescript
const pool = new WorktreePool(projectRoot);
await pool.createGroupWorktree(0);
await pool.createGroupWorktree(1);
// 后续任务可复用这些 Worktree
```

### 分组策略选择

| 场景 | 推荐策略 |
|------|---------|
| 文件大小均匀 | round-robin |
| 按功能模块分布 | by-package |
| 大文件小文件混合 | by-complexity |

## 相关链接

- [设计文档](../superpowers/specs/2025-04-22-bare-repo-worktree-design.md)
- [并行优化文档](../parallel-optimization/README.md)
- [Git Worktree 文档](https://git-scm.com/docs/git-worktree)
- [Bare Repository 文档](https://git-scm.com/book/en/v2/Git-on-the-Server-Getting-Git-on-a-Server)