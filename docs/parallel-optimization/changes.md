# 变更记录

## 概述

本次优化为 DTAgent CLI 任务队列添加了并行执行隔离机制，解决 Maven 编译冲突问题。

## 变更清单

### 新增文件

#### 1. `src/core/workspace-manager.ts`

**描述**: 工作空间池管理器模块，实现工作空间复用模式

**主要功能**:
- 预创建固定数量的工作空间槽位（对应 batchSize）
- 槽位复用：只清空 test/target，保留 src/pom/.m2
- 任务调度：空闲槽位分配给新任务
- 最终清理：队列结束后删除所有槽位

**接口**:
```typescript
class WorkspacePool {
  initialize(): Promise<boolean>           // 初始化池子
  acquireSlot(taskId: string): WorkspaceSlot | null  // 获取空闲槽位
  releaseSlot(slotIndex: number): void     // 释放槽位（复用）
  destroy(): void                          // 销毁整个池子
}
```

**设计决策**:
- 使用 Windows junction 软链接（无需管理员权限）
- 固定 batchSize 个 .m2 仓库（不是每个任务一个）
- 槽位复用策略：只清空 test/target，秒级切换
- 队列结束后删除整个池子

---

### 修改文件

#### 1. `templates/plugins/task-manager.ts`

**变更类型**: 功能增强

**变更内容**:

1. **导入 WorkspacePool**
   ```typescript
   import { WorkspacePool, createWorkspacePool } from "../../src/core/workspace-manager"
   ```

2. **扩展 QueueState 接口**
   ```typescript
   interface QueueState {
     // ... 原有字段
     workspacePool?: WorkspacePool       // 新增：工作空间池
     taskSlotMap?: Map<number, number>   // 新增：任务索引 -> 槽位索引映射
   }
   ```

3. **修改 executeTask 函数**
   - 当 `batchSize > 1` 时，从池中获取空闲槽位（acquireSlot）
   - 在 prompt 中注入槽位信息和 Maven 参数
   - 任务完成后释放槽位（releaseSlot），复用不删除

4. **修改 executeAllTasks 函数**
   - 所有任务完成后，销毁整个工作空间池（destroy）

5. **修改 task-start 工具**
   - 如果 `batchSize > 1`，初始化 WorkspacePool（initialize）
   - 在返回消息中显示并行数和隔离模式

6. **修改 task-stop 工具**
   - 添加 `destroy()` 调用，销毁整个工作空间池

**代码示例**:

修改前:
```typescript
async function executeTask(index: number) {
  // ... 准备 prompt
  const session = await client.session.create({ body: { title } })
  await client.session.prompt({ path: { id: sessionId }, body: { parts: [{ text: fullPrompt }] } })
  // ... 返回结果
}
```

修改后:
```typescript
async function executeTask(index: number) {
  // ... 准备 prompt
  
  // 获取工作空间槽位（如果并行）
  let slotIndex: number | null = null
  if (queue.batchSize > 1 && queue.workspacePool) {
    const slot = queue.workspacePool.acquireSlot(taskId)
    if (slot) {
      slotIndex = slot.slotIndex
      fullPrompt = `[工作空间隔离模式]\n` +
        `槽位: ${slotIndex}\n` +
        `工作目录: ${slot.path}\n` +
        `请在执行 Maven 命令时使用:\n` +
        `mvn <command> -Dmaven.repo.local="${slot.m2Path}"\n\n` +
        `${fullPrompt}`
    }
  }
  
  const session = await client.session.create({ body: { title } })
  await client.session.prompt({ path: { id: sessionId }, body: { parts: [{ text: fullPrompt }] } })
  
  // 释放槽位（复用，不删除）
  if (queue.batchSize > 1 && queue.workspacePool && slotIndex !== null) {
    queue.workspacePool.releaseSlot(slotIndex)
  }
  
  // ... 返回结果
}
```

---

## 兼容性

### 向后兼容

✅ **完全向后兼容**

- `batchSize=1`（默认值）时，不创建工作空间，行为不变
- 现有任务队列命令无需修改
- 现有 Agent 技能无需修改

### 向前兼容

⚠️ **需要注意**

- Agent 必须支持 `-Dmaven.repo.local` 参数
- 旧版 Agent 可能无法识别工作空间隔离提示

---

## 测试验证

### 原型验证

**测试项目**: config-history
**测试命令**: `.sisyphus/scripts/workspace-isolation-prototype.ts`

**结果**:
| 测试项 | 结果 |
|--------|------|
| 软链接创建 | ✅ 通过 |
| 独立 .m2 编译 | ✅ 通过 |
| 并行编译隔离 | ✅ 通过 |
| 性能对比 | ✅ 1.19x 加速 |

### 集成测试

待执行:
- [ ] batchSize=4 执行 10 个任务
- [ ] 验证无 Maven 冲突
- [ ] 验证工作目录自动清理

---

## 回滚方案

如需回滚，只需恢复 `templates/plugins/task-manager.ts` 文件到修改前状态。

**回滚步骤**:
```bash
git checkout templates/plugins/task-manager.ts
```

**回滚影响**:
- 并行执行恢复原有行为（可能冲突）
- WorkspaceManager 模块保留但不使用

---

## 文档更新

### 新增文档

1. `docs/parallel-optimization/architecture.md` - 方案架构文档
2. `docs/parallel-optimization/changes.md` - 本变更记录
3. `.sisyphus/evidence/prototype-verification-report.md` - 原型验证报告

### 待更新文档

- [ ] README.md - 添加并行执行说明
- [ ] docs/usage-scenarios.md - 添加使用场景

---

## 性能影响

### 正面影响

- 并行执行加速（1.19x - 2x，取决于任务数）
- 消除 Maven 编译冲突
- 提高任务队列吞吐量

### 负面影响

- 磁盘空间占用（每个任务 100-500MB，临时）
- 首次编译较慢（依赖下载）
- 软链接创建开销（可忽略）

---

## 已知限制

1. **Windows 权限**: 非管理员用户可用 junction 软链接
2. **磁盘空间**: 需要足够的临时磁盘空间
3. **依赖重复**: 每个任务的 .m2 仓库会重复下载依赖

---

## 版本信息

- **版本**: 未发布（集成测试中）
- **提交**: 待提交
- **作者**: DTAgent CLI Team
- **日期**: 2025-03-26
