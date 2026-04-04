# 任务队列并行优化 - 方案架构

## 概述

本文档描述 DTAgent CLI 任务队列并行执行的优化方案，解决并行执行时 Maven 编译冲突问题。

## 问题背景

### 原有问题

当设置 `batchSize > 1` 时，多个任务并行执行：

```
问题场景:
├── Task 1: mvn test -Dtest=UserServiceTest
├── Task 2: mvn test -Dtest=OrderServiceTest  (并行执行)
└── Task 3: mvn test -Dtest=PaymentServiceTest (并行执行)

冲突原因:
1. target/ 目录被多个任务同时写入
2. .m2 仓库文件锁定冲突
3. 编译产物互相覆盖
4. 测试报告互相覆盖
```

### 解决方案

**工作空间池**：预创建固定数量的工作空间槽位，任务复用槽位

```
优化后:
.dtagent/workspace-pool/        # 工作空间池
├── slot-0/                     # 槽位 0（固定，复用）
│   ├── src -> /project/src     # 永久软链接
│   ├── pom.xml -> /project/pom.xml
│   ├── .m2/                    # 永久 .m2（依赖只下载一次）
│   └── target/                 # 每次任务后清空
├── slot-1/                     # 槽位 1
├── slot-2/                     # 槽位 2
└── slot-3/                     # 槽位 3（假设 batchSize=4）

任务调度:
├── 任务 1 → slot-0（首次：下载依赖到 .m2）
├── 任务 2 → slot-1（首次：下载依赖到 .m2）
├── 任务 3 → slot-2
├── 任务 4 → slot-3
├── 任务 5 → slot-0（复用：只清空 target/test，保留 .m2）
└── ...

每个槽位在独立目录下执行 mvn test
→ 无冲突！
→ 槽位复用，IO 最小化！

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    TaskManager Plugin                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  task-create │───▶│  QueueState  │◀───│task-create-files│
│  └─────────────┘    └──────┬───────┘    └──────────────┘   │
│                            │                                │
│                            ▼                                │
│                    ┌──────────────┐                         │
│                    │  task-start  │                         │
│                    └──────┬───────┘                         │
│                           │                                 │
│          ┌────────────────┼────────────────┐               │
│          │                │                │                │
│          ▼                ▼                ▼                │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│    │ execute  │    │ execute  │    │ execute  │           │
│    │ Task 1   │    │ Task 2   │    │ Task 3   │           │
│    └────┬─────┘    └────┬─────┘    └────┬─────┘           │
│         │               │               │                  │
│         ▼               ▼               ▼                  │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│    │Workspace │    │Workspace │    │Workspace │           │
│    │  Pool    │    │  Pool    │    │  Pool    │           │
│    │(acquire) │    │(acquire) │    │(acquire) │           │
│    └────┬─────┘    └────┬─────┘    └────┬─────┘           │
│         │               │               │                  │
│         ▼               ▼               ▼                  │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│    │  Slot-0  │    │  Slot-1  │    │  Slot-2  │           │
│    │(reusable)│    │(reusable)│    │(reusable)│           │
│    └──────────┘    └──────────┘    └──────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

#### 1. WorkspacePool

**文件**: `src/core/workspace-manager.ts`

**职责**:
- 预创建固定数量的工作空间槽位（对应 batchSize）
- 管理槽位复用（只清空 test/target，保留 src/pom/.m2）
- 任务调度：空闲槽位分配给新任务
- 最终清理：队列结束后删除所有槽位

**主要方法**:
```typescript
class WorkspacePool {
  initialize(): Promise<boolean>           // 初始化池子，创建固定槽位
  acquireSlot(taskId: string): WorkspaceSlot | null  // 获取空闲槽位
  releaseSlot(slotIndex: number): void     // 释放槽位（复用）
  destroy(): void                          // 销毁整个池子
}
```

**工作空间复用策略**:
```
初始化（task-start）:
├── 创建 slot-0/：src → project, pom.xml → project, .m2/, target/, src/test/
├── 创建 slot-1/：同上
├── 创建 slot-2/：同上
└── 创建 slot-3/：同上（假设 batchSize=4）

任务执行（executeTask）:
├── 任务 1 → 获取 slot-0（首次：下载依赖到 .m2）
├── 任务 2 → 获取 slot-1（首次：下载依赖到 .m2）
├── 任务 3 → 获取 slot-2
├── 任务 4 → 获取 slot-3
├── 任务 5 → 获取 slot-0（复用：只清空 test/target，保留 .m2）
└── ...

结束（task-stop 或完成）:
└── 删除整个 workspace-pool/ 目录
```

**优势**:
- 依赖只下载 batchSize 次（不是任务数量次）
- 软链接只创建 batchSize 次
- 任务切换只需清空 test/target，秒级完成
- 磁盘占用固定：batchSize × 500MB

#### 2. TaskManager (已集成)

**文件**: `templates/plugins/task-manager.ts`

**修改点**:
- `task-start`: 初始化 WorkspacePool（创建 batchSize 个槽位）
- `executeTask`: 获取/释放槽位（acquire/release）
- `executeAllTasks`: 队列完成后销毁池子
- `task-stop`: 强制销毁池子

**工作流程**:
```
batchSize=1 (串行):
  直接执行，不创建工作空间池

batchSize>1 (并行):
  1. task-start 初始化 WorkspacePool
     └── 创建 slot-0 到 slot-(batchSize-1)
     └── 每个槽位：src/pom.xml 软链接 + .m2/ + target/ + src/test/
  
  2. executeTask 获取槽位
     └── acquireSlot()：获取空闲槽位
     └── resetSlot()：清空 target/ 和 src/test/
     └── 在 prompt 中注入槽位路径和 Maven 参数
  
  3. Agent 在槽位中执行 Maven 命令
     └── mvn <command> -Dmaven.repo.local="{slot}/.m2"
  
  4. 任务完成后释放槽位
     └── releaseSlot()：清空 target/ 和 src/test/
     └── 槽位标记为空闲，保留 src/pom/.m2
  
  5. 下一个任务复用槽位（循环步骤 2-4）
  
  6. 所有任务完成后销毁池子
     └── destroy()：删除整个 workspace-pool/ 目录
     
  7. task-stop 强制销毁池子
```

## 工作空间结构

### 池子结构

```
.dtagent/workspace-pool/
├── slot-0/                     # 槽位 0
│   ├── src              → 软链接到项目 src 目录（永久）
│   ├── pom.xml          → 软链接到项目 pom.xml（永久）
│   ├── .m2/             → 独立 Maven 本地仓库（永久，依赖只下载一次）
│   ├── target/          → 编译输出目录（每次任务后清空）
│   └── src/test/        → 测试源码目录（每次任务后清空）
├── slot-1/                     # 槽位 1
├── slot-2/                     # 槽位 2
└── slot-3/                     # 槽位 3（假设 batchSize=4）
```

### 槽位生命周期

```
初始化 (task-start):
  ├── 创建 slot-0/ 目录
  ├── 软链接 src -> /project/src
  ├── 软链接 pom.xml -> /project/pom.xml
  ├── 创建 .m2/ 目录
  ├── 创建 target/ 目录
  └── 创建 src/test/ 目录
  （slot-1, slot-2, slot-3 同上）

任务执行 (executeTask):
  1. acquireSlot()：获取空闲槽位（如 slot-0）
  2. resetSlot()：
     ├── 清空 target/（删除所有编译产物）
     └── 清空 src/test/（删除测试文件）
  3. Agent 在槽位中执行 Maven 命令
  4. releaseSlot()：
     ├── 清空 target/
     └── 清空 src/test/
  5. 槽位标记为空闲，等待下一个任务

销毁 (destroy):
  └── 删除整个 workspace-pool/ 目录
```

## 并行执行流程

### 时序图

```
用户              TaskManager         WorkspacePool          Agent
 │                    │                      │                │
 │──task-create──────▶│                      │                │
 │                    │                      │                │
 │──task-start───────▶│                      │                │
 │                    │──batchSize>1?───────▶│                │
 │                    │◀──initialize()      │                │
 │                    │  (创建 batchSize    │                │
 │                    │   个槽位)           │                │
 │◀──队列已启动───────│                      │                │
 │                    │                      │                │
 │                    │──executeTask(1)─────▶│                │
 │                    │                      │──acquireSlot() │
 │                    │◀──slot-0────────────│                │
 │                    │  (获取空闲槽位)      │                │
 │                    │                      │──resetSlot()   │
 │                    │                      │  (清空target)  │
 │                    │                      │                │
 │                    │──prompt─────────────│────────────────▶│
 │                    │ (包含槽位信息)       │                │
 │                    │                      │                │
 │                    │◀──完成──────────────│────────────────│
 │                    │──releaseSlot(0)─────▶│                │
 │                    │                      │  (清空+空闲)   │
 │                    │                      │                │
 │                    │──executeTask(2)─────▶│                │
 │                    │──executeTask(3)─────▶│                │
 │                    │──executeTask(4)─────▶│                │
 │                    │  (并行执行)          │                │
 │                    │                      │                │
 │                    │──executeTask(5)─────▶│                │
 │                    │                      │──acquireSlot() │
 │                    │◀──slot-0────────────│                │
 │                    │  (复用槽位0)         │                │
 │                    │                      │                │
 │──task-status──────▶│                      │                │
 │◀──状态─────────────│                      │                │
 │                    │                      │                │
 │──task-stop────────▶│                      │                │
 │                    │──destroy()──────────▶│                │
 │                    │                      │ (删除整个池子) │
```

### 执行逻辑

```typescript
// 简化伪代码
async function executeTask(index) {
  const taskId = generateTaskId(index)
  
  // 1. 创建工作空间（如果并行）
  if (batchSize > 1) {
    workspace = workspaceManager.createWorkspace(taskId)
    prompt += `[工作空间隔离]\n工作目录: ${workspace.path}\n`
    prompt += `mvn 命令使用: -Dmaven.repo.local="${workspace.m2Path}"\n\n`
  }
  
  // 2. 创建 Session 并发送 Prompt
  session = await createSession()
  await session.prompt(prompt)
  
  // 3. 等待任务完成
  result = await waitForCompletion(session)
  
  // 4. 清理工作空间
  if (batchSize > 1) {
    workspaceManager.cleanupWorkspace(taskId)
  }
  
  return result
}
```

## 关键决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 隔离粒度 | 类级（每个类独立） | 并行度最高，实现简单 |
| 软链接类型 | Windows junction + 硬链接 | 无需管理员权限 |
| 目录分组 | 无 | 每个类独立，不需要分组 |
| 生命周期 | 任务完成立即清理 | 不占用磁盘 |
| 并行度控制 | batchSize 参数 | 用户可控 |

## 性能表现

### 测试环境
- 项目: config-history
- 平台: Windows
- 测试类: 3-10 个

### 测试结果

| 执行方式 | 时间 | 加速比 |
|----------|------|--------|
| 串行 (batchSize=1) | ~60s | 1x |
| 并行 (batchSize=4) | ~50s | 1.19x |

**说明**:
- 首次并行有依赖下载开销
- 后续运行预计加速比更高

## 使用方式

### 1. 单文件模式（自动）

```bash
# batchSize=1，串行执行，不创建工作空间
/generate-dt-single src/main/java/UserService.java
```

### 2. 目录模式（自动隔离）

```bash
# batchSize>1，自动创建工作空间隔离
/generate-dt-dir src/main/java/service batchSize=4
```

### 3. 任务队列模式

```bash
# 创建队列（batchSize=4 启用隔离）
/task-create dir=src/main/java/service ext=java batchSize=4 prompt="..."

# 启动执行
/task-start
```

## 测试文件自动复制

### 功能说明

任务在槽位中生成测试文件后，**自动复制到原项目目录**，确保测试文件持久化保存。

### 复制流程

```
任务执行流程:
├── 1. acquireSlot() - 获取空闲槽位
├── 2. resetSlot() - 清空 target/ 和 src/test/
├── 3. Agent 在槽位中生成测试文件
│   └── slot-{n}/src/test/java/com/example/MyTest.java
├── 4. 任务成功完成
├── 5. copyTestFiles() - 复制测试文件到原项目
│   └── 从 slot-{n}/src/test/java → project/src/test/java
├── 6. releaseSlot() - 释放槽位（保留 src/pom/.m2）
└── 7. 槽位复用，等待下一个任务
```

### 复制逻辑

**源目录**: `slot-{index}/src/test/java`  
**目标目录**: `projectRoot/src/test/java`  
**复制方式**: 递归复制，保持包路径结构

```typescript
// 伪代码
function copyTestFiles(slotIndex, projectRoot) {
  const sourceDir = slot.path + "/src/test/java"
  const targetDir = projectRoot + "/src/test/java"
  
  // 递归复制目录
  copyDirectoryRecursive(sourceDir, targetDir)
}

// 递归复制函数
function copyDirectoryRecursive(source, target) {
  for (const entry of fs.readdir(source)) {
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath)
    } else {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}
```

### 复制时机

**触发条件**:
- 任务成功完成（`success: true`）
- batchSize > 1（启用工作空间池）
- 在释放槽位之前执行

**不复制的情况**:
- 任务失败（失败时只释放槽位，不复制）
- batchSize = 1（串行模式，无需复制）
- 源目录不存在（没有测试文件）

### 错误处理

```typescript
// 复制失败不影响任务结果
const copied = workspacePool.copyTestFiles(slotIndex, directory)
if (!copied) {
  console.error(`[TaskManager] 复制测试文件失败: 槽位 ${slotIndex}`)
  // 继续执行，任务仍标记为成功
}
```

**特点**:
- ✅ 复制失败只记录日志，不影响任务成功状态
- ✅ 槽位中的测试文件保留（备份）
- ✅ 下次任务复用槽位时会清空 test/ 目录

### 示例

```
槽位 0 执行任务 1:
├── 槽位目录: .dtagent/workspace-pool/slot-0/
├── 生成测试文件: slot-0/src/test/java/com/example/UserServiceTest.java
├── 复制后: project/src/test/java/com/example/UserServiceTest.java
└── 槽位释放: 保留 src/pom/.m2，清空 target/test

槽位 0 执行任务 2（复用）:
├── 槽位目录: .dtagent/workspace-pool/slot-0/
├── 生成测试文件: slot-0/src/test/java/com/example/OrderServiceTest.java
├── 复制后: project/src/test/java/com/example/OrderServiceTest.java
└── 槽位释放: 保留 src/pom/.m2，清空 target/test

最终:
├── project/src/test/java/com/example/UserServiceTest.java (来自任务 1)
└── project/src/test/java/com/example/OrderServiceTest.java (来自任务 2)
```

## 注意事项

1. **磁盘空间**: 每个工作空间占用约 100-500MB（首次编译后）
2. **清理机制**: 任务完成后自动清理，异常时 task-stop 会强制清理
3. **Maven 参数**: Agent 必须在 prompt 中使用 `-Dmaven.repo.local` 参数
4. **Windows 权限**: junction 软链接不需要管理员权限
5. **测试文件**: 任务成功后会自动复制到原项目，无需手动处理

## 文件变更

### 新增文件
- `src/core/workspace-manager.ts` - 工作空间管理器

### 修改文件
- `templates/plugins/task-manager.ts` - 集成工作空间隔离和测试文件复制

### 新增方法
- `WorkspacePool.copyTestFiles(slotIndex, projectRoot)` - 复制测试文件到原项目
- `WorkspacePool.copyDirectoryRecursive(source, target)` - 递归复制目录

## 后续优化

1. **依赖缓存共享**: 多个 .m2 仓库可共享已下载的依赖
2. **预编译**: 批量任务前预编译公共代码
3. **动态并行度**: 根据系统资源动态调整 batchSize
4. **增量复制**: 只复制变更的测试文件，减少 IO
