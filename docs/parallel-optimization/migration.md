# 迁移指南：从 WorkspacePool 到 async-lock

本文档描述从 WorkspacePool（槽位隔离）迁移到 async-lock（锁机制）的完整步骤。

## 背景

### 为什么迁移

WorkspacePool 方案存在以下问题：

| 问题 | 影响 |
|------|------|
| 槽位数量限制 | 并发度受限于槽位数量 |
| 资源浪费 | 空闲槽位仍占用磁盘空间 |
| 实现复杂度高 | 需维护槽位状态、分配策略、清理机制 |
| 槽位泄漏风险 | 槽位泄漏会导致可用槽位减少，最终死锁 |

async-lock 方案的优势：

| 优势 | 说明 |
|------|------|
| 实现简单 | 一行代码搞定互斥 |
| 资源高效 | 共享 .m2 缓存，节省 67% 空间 |
| 自动恢复 | 进程崩溃，锁自动释放 |
| 无上限 | 理论支持无限并发请求排队 |

### 迁移决策

| 维度 | WorkspacePool | async-lock |
|------|---------------|------------|
| 隔离方式 | 空间隔离（槽位） | 时间隔离（锁） |
| 并发控制 | 槽位数量限制 | 队列排队等待 |
| 资源占用 | 每槽位独立工作空间 | 共享单一工作空间 |
| 依赖管理 | 每槽位独立 .m2 | 共享 .m2 缓存 |
| 实现复杂度 | 高 | 低 |
| 故障恢复 | 槽位泄漏需手动清理 | 锁自动释放 |

**结论**：async-lock 更适合当前场景，简单可靠。

## Breaking Changes

### 1. 代码删除

**删除文件**：
```
src/core/workspace-manager.ts  # WorkspacePool 类已删除
```

**删除代码**：
```typescript
// 删除 WorkspacePool 相关代码
- WorkspacePool 类
- WorkspaceSlot 接口
- 槽位分配逻辑 (acquireSlot, releaseSlot)
- 槽位状态管理
- 槽位清理逻辑 (resetSlot, destroy)
```

### 2. 代码新增

**新增依赖**：
```json
// package.json
{
  "dependencies": {
    "async-lock": "^1.4.0"
  }
}
```

**新增代码**：
```typescript
// src/tools/maven-test.ts
import AsyncLock from 'async-lock';

const mavenLock = new AsyncLock();

export async function mavenTest(params: MavenTestParams) {
  return mavenLock.acquire('maven', async () => {
    // 执行 mvn test 命令
    return executeMavenCommand(params);
  });
}
```

### 3. 配置变更

**删除配置**：
```json
// 删除槽位相关配置
- "maxSlots": 3
- "workspacePoolDir": ".dtagent/workspace-pool"
```

**新增配置**（可选）：
```json
// 锁超时配置（可选）
+ "lockTimeout": 300000  // 5 分钟
```

### 4. 行为变更

| 行为 | 旧方案 | 新方案 |
|------|--------|--------|
| Maven 测试 | 多槽位并行 | 串行执行（锁互斥） |
| .m2 缓存 | 每槽位独立 | 共享缓存 |
| 工作空间 | 多份拷贝 | 单一共享 |
| Prompt 注入 | 需注入槽位路径 | 无需注入 |
| 测试文件复制 | 从槽位复制到原项目 | 直接写入原项目 |

### 5. 命令参数

**batchSize 参数**：
- **旧含义**：槽位数量（限制并行度）
- **新含义**：并发 Session 数量（mvn test 仍串行）

**Maven 参数**：
- **旧要求**：Prompt 中需注入 `-Dmaven.repo.local="${slot}/.m2"`
- **新要求**：无需注入（使用共享 .m2）

## 迁移步骤

### Step 1: 安装 async-lock 依赖

```bash
npm install async-lock
```

### Step 2: 删除 WorkspacePool 代码

```bash
# 删除文件
rm src/core/workspace-manager.ts

# 或在 Windows
del src\core\workspace-manager.ts
```

### Step 3: 修改 maven-test 工具

```typescript
// src/tools/maven-test.ts

import AsyncLock from 'async-lock';

const mavenLock = new AsyncLock();

export async function mavenTest(params: MavenTestParams) {
  // 使用锁保护 Maven 操作
  return mavenLock.acquire('maven', async () => {
    const { level, target } = params;
    
    let command = 'mvn test';
    if (level === 'class' && target) {
      command += ` -Dtest=${target}`;
    } else if (level === 'package' && target) {
      command += ` -Dtest=${target}.*`;
    }
    
    // 执行命令（使用共享 .m2）
    return executeCommand(command);
  });
}
```

### Step 4: 更新 TaskManager 插件

```typescript
// templates/plugins/task-manager.ts

// 删除 WorkspacePool 相关导入
- import { WorkspacePool } from '../core/workspace-manager';

// 删除 WorkspacePool 初始化
- workspacePool.initialize();

// 删除槽位获取逻辑
- const slot = workspacePool.acquireSlot(taskId);
- const workspacePath = slot.path;

// 删除槽位释放逻辑
- workspacePool.releaseSlot(slotIndex);

// 删除测试文件复制逻辑
- workspacePool.copyTestFiles(slotIndex, projectRoot);

// 删除 WorkspacePool 销毁逻辑
- workspacePool.destroy();
```

### Step 5: 更新 Prompt 模板

```markdown
<!-- templates/commands/generate-dt-single.md -->

<!-- 删除槽位路径注入 -->
- [工作空间隔离]
- 工作目录: {{workspacePath}}
- Maven 命令使用: -Dmaven.repo.local="{{m2Path}}"

<!-- 新模板无需注入 -->
直接在原项目目录执行测试即可。
```

### Step 6: 删除槽位配置

```typescript
// 删除配置项
const queueConfig = {
  batchSize: 4,  // 保留，控制并发 Session 数
  // 删除以下配置
  // maxSlots: 4,
  // workspacePoolDir: '.dtagent/workspace-pool',
};
```

### Step 7: 清理旧工作空间

```bash
# 删除旧的工作空间池目录（如果存在）
rm -rf .dtagent/workspace-pool

# 或在 Windows
rmdir /s /q .dtagent\workspace-pool
```

## 迁移检查清单

### 代码层面

- [x] 安装 async-lock 依赖
- [x] 删除 WorkspacePool 类文件
- [x] 在 maven-test 工具中加锁
- [x] 删除 TaskManager 中的 WorkspacePool 引用
- [x] 删除槽位获取/释放逻辑
- [x] 删除测试文件复制逻辑
- [x] 删除槽位配置项
- [x] 更新 Prompt 模板（移除槽位路径注入）

### 配置层面

- [x] 更新 package.json（添加 async-lock）
- [x] 删除槽位配置
- [ ] 配置锁超时（可选）

### 文档层面

- [x] 更新架构文档
- [x] 更新 README
- [x] 创建迁移指南
- [ ] 更新运维手册

### 测试层面

- [ ] 执行回归测试
- [ ] 性能基准测试
- [ ] 并发测试验证

## 性能对比

### 测试场景

- 4 个并发 Session
- 每个测试耗时 30 秒
- 测试代码相同

### WorkspacePool（旧）

```
时间线：
[0s - 30s]   Session 1, 2, 3 执行（并行）
[30s - 60s]  Session 4 执行（等待槽位）

总耗时：60 秒
并行度：3（槽位数量）
磁盘占用：3 x 500MB = 1.5GB
```

### async-lock（新）

```
时间线：
[0s - 30s]   Session 1 执行
[30s - 60s]  Session 2 执行
[60s - 90s]  Session 3 执行
[90s - 120s] Session 4 执行

总耗时：120 秒
并行度：1（串行）
磁盘占用：500MB

节省空间：67%
```

### 权衡

| 指标 | WorkspacePool | async-lock |
|------|---------------|------------|
| 总耗时 | 60s | 120s |
| 磁盘占用 | 1.5GB | 500MB |
| 实现复杂度 | 高 | 低 |
| 维护成本 | 高 | 低 |
| 故障恢复 | 手动 | 自动 |

**结论**：async-lock 以时间换空间，适合资源受限场景。

## 常见问题

### Q1: batchSize 参数还有用吗？

**答**：有用。batchSize 现在控制并发 Session 数量，Session 思考阶段仍并发执行。只是 `mvn test` 通过锁机制串行执行。

### Q2: 为什么 Maven 测试要串行执行？

**答**：Maven 编译和测试会写入 target 目录和 .m2 缓存，并发执行会导致冲突。通过锁机制串行执行，保证写入互斥。

### Q3: 串行执行会不会很慢？

**答**：
- Session 思考阶段仍并发，大部分时间在思考而非测试
- 对于短测试（1-3 分钟），串行执行可接受
- 节省的磁盘空间和实现简洁度值得权衡

### Q4: 如何监控锁等待时间？

**答**：可在 maven-test 工具中添加监控：

```typescript
export async function mavenTest(params: MavenTestParams) {
  const startTime = Date.now();
  
  return mavenLock.acquire('maven', async () => {
    const waitTime = Date.now() - startTime;
    if (waitTime > 1000) {
      console.log(`[Lock] Wait time: ${waitTime}ms`);
    }
    
    return executeMavenCommand(params);
  });
}
```

### Q5: 如何处理锁超时？

**答**：async-lock 支持超时设置：

```typescript
await mavenLock.acquire('maven', async () => {
  // ...
}, { timeout: 300000 });  // 5 分钟超时
```

超时后会抛出异常，可在调用方捕获处理。

### Q6: 遇到缓存冲突怎么办？

**答**：
- 共享 .m2 缓存偶发冲突可通过 `mvn clean` 解决
- Maven 自身处理并发读取
- 锁保证写入互斥，冲突概率很低

## 回滚方案

如果新方案出现问题，可回滚到 WorkspacePool：

### Step 1: 恢复代码

```bash
git checkout HEAD~1 src/core/workspace-manager.ts
git checkout HEAD~1 templates/plugins/task-manager.ts
git checkout HEAD~1 src/tools/maven-test.ts
```

### Step 2: 恢复依赖

```bash
npm uninstall async-lock
```

### Step 3: 恢复配置

恢复槽位配置项和 Prompt 模板。

### Step 4: 重启服务

重启 CLI 服务，验证 WorkspacePool 正常工作。

**注意**：回滚后需要重新创建槽位目录。

## 总结

### 迁移收益

1. **实现简化**：删除 WorkspacePool 复杂逻辑
2. **资源节省**：共享 .m2 缓存，节省 67% 空间
3. **故障自愈**：进程崩溃，锁自动释放
4. **维护成本降低**：无状态管理，无需槽位泄漏处理

### 迁移成本

1. **性能下降**：测试串行执行，总耗时增加
2. **等待时间增加**：高并发时排队时间变长
3. **代码变更**：需要修改多处代码

### 建议

对于当前场景（测试时间适中、磁盘资源有限），async-lock 方案更合适。如果未来需要更高吞吐量，可升级为模块级锁。

---

**文档版本**: v1.0  
**更新时间**: 2025-04-06  
**适用版本**: DTAgent CLI v2.0+