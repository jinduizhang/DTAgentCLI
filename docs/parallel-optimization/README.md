# 任务队列并行优化

本文档目录包含 DTAgent CLI 任务队列并行优化的完整记录。

## 目录结构

```
docs/parallel-optimization/
├── README.md              # 本文件
├── architecture.md        # 方案架构文档
├── changes.md             # 变更记录
├── migration.md           # 迁移指南（新增）
└── process.md             # 优化过程记录
```

## 文档说明

### 📐 [架构文档](./architecture.md)

**内容**: 完整的系统架构设计

**包含**:
- 问题背景与解决方案
- ~~工作空间池设计~~（已废弃）
- **锁机制设计**（当前方案）
- 核心组件设计
- 并行执行流程
- 关键决策说明
- **迁移指南**

**适用对象**: 开发人员、架构师

---

### 📝 [变更记录](./changes.md)

**内容**: 详细的代码变更清单

**包含**:
- 新增文件说明
- 修改文件对比
- 兼容性分析
- 回滚方案
- 测试验证结果

**适用对象**: 开发人员、测试人员

---

### 🔄 [迁移指南](./migration.md)（新增）

**内容**: 从 WorkspacePool 迁移到 async-lock 的完整指南

**包含**:
- 迁移步骤
- Breaking changes
- 代码变更对比
- 配置调整
- 检查清单

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

### 方案概述

> **当前方案**：采用 **async-lock 锁机制** 实现 Maven 编译互斥

**架构演进**：

| 方案 | 状态 | 说明 |
|------|------|------|
| WorkspacePool | 已废弃 | 槽位隔离，复杂度高 |
| async-lock | **当前方案** | 锁机制，简单可靠 |

**核心机制**：

```
并发模型:
├── Session 思考：并发执行（batchSize 控制）
├── mvn test：串行执行（async-lock 互斥）
└── 资源共享：单一 .m2 缓存，单一工作空间

关键特性:
├── ✅ 实现简单：一行代码搞定互斥
├── ✅ 资源高效：共享缓存，节省空间
├── ✅ 自动恢复：进程崩溃，锁自动释放
├── ✅ 无上限：理论支持无限并发请求排队
└── ⚠️ 测试串行：吞吐量受限于单线程
```

**对比旧方案（WorkspacePool）**：

```
旧方案（已废弃）:
.dtagent/workspace-pool/          # 工作空间池（batchSize 个槽位）
├── slot-0/                       # 槽位 0（复用）
├── slot-1/                       # 槽位 1
├── slot-2/                       # 槽位 2
└── slot-3/                       # 槽位 3

问题:
- 槽位数量限制并发度
- 空闲槽位占磁盘空间
- 槽位泄漏风险
- 实现复杂度高

新方案（async-lock）:
├── mavenLock.acquire('maven')    # 全局互斥锁
├── 共享 .m2 缓存                  # 节省 67% 空间
└── 共享工作空间                   # 无需多份拷贝

优势:
- 实现简单
- 自动恢复
- 资源高效
```

**详细文档**：
- [锁机制架构](../lock-mechanism/architecture.md)
- [新旧对比](../lock-mechanism/comparison.md)
- [迁移指南](./migration.md)

---

### 核心变更

**新增（当前方案）**：
- `async-lock` 依赖 - 全局互斥锁库

**删除（旧方案）**：
- `src/core/workspace-manager.ts` - WorkspacePool 已删除

**修改**：
- `templates/plugins/task-manager.ts` - 集成锁机制
- `src/tools/maven-test.ts` - 内部加锁实现互斥

### 使用方法

> **注意**：`batchSize` 参数仍然有效，控制并发 Session 数量。但 Maven 测试通过锁机制串行执行。

```bash
# 串行执行（batchSize=1）
/task-create dir=src/main/java ext=java batchSize=1 prompt="..."

# 并行执行（batchSize=4，Session 并发，mvn test 串行）
/task-create dir=src/main/java ext=java batchSize=4 prompt="..."

# 或使用简写命令
/generate-dt-dir src/main/java/service --batch-size 4
/mr-ut --base main --batch-size 4
/diff-ut --base main --batch-size 4
/fix-ut src/test/java/service --batch-size 4
```

**行为说明**：
- `batchSize=1`: 单 Session 执行，无并发
- `batchSize>1`: 多 Session 并发思考，但 `mvn test` 串行执行（通过锁互斥）
- **无需槽位路径**：测试文件直接写入原项目目录

## 验证报告

**原型验证**: 通过 ✅

- [x] 软链接创建
- [x] 独立 .m2 编译
- [x] 并行编译隔离
- [x] 性能对比（1.19x 加速）

**测试报告**: `.sisyphus/evidence/prototype-verification-report.md`

## 性能提升

| 执行方式 | 时间 | 加速比 | 说明 |
|----------|------|--------|------|
| 串行 | ~60s | 1x | batchSize=1 |
| 并行 (4任务) | ~50s | 1.19x | batchSize=4，首次有依赖下载 |
| 并行 (后续) | ~30s | 2x | 槽位复用，依赖已缓存 |

*注：首次运行有依赖下载开销，槽位复用后显著加速*

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 隔离方案 | async-lock（锁机制） | 实现简单，故障自愈，资源高效 |
| 并发模型 | Session 并发 + mvn test 串行 | 思考并发提升效率，测试串行保证隔离 |
| batchSize | 控制并发 Session 数量 | 与用户预期一致 |
| 资源管理 | 共享 .m2 缓存 | 节省空间，提高缓存命中率 |
| 锁粒度 | 全局锁 | 实现简单，满足当前需求 |

> **废弃决策**：
> - ~~隔离方案：WorkspacePool（槽位隔离）~~ → 已改为锁机制
> - ~~槽位数量：batchSize~~ → batchSize 现控制并发 Session 数
> - ~~复用策略：清空 test/target~~ → 无需槽位复用
> - ~~清理时机：队列结束~~ → 无需清理槽位

## 兼容性

✅ **向后兼容**: batchSize 参数行为一致（控制并发 Session 数）

✅ **向前改进**: 无需 Agent 支持 `-Dmaven.repo.local` 参数（使用共享 .m2）

⚠️ **行为变更**: Maven 测试串行执行（通过锁互斥），而非槽位隔离并行

## 迁移说明

从 WorkspacePool 迁移到 async-lock 的详细步骤，请参阅 [迁移指南](./migration.md)。

**关键变更**：
- WorkspacePool 类已删除
- `src/tools/maven-test.ts` 内部加锁
- Prompt 中无需注入槽位路径
- 测试文件直接写入原项目目录

## 贡献者

- 方案设计: DTAgent CLI Team
- 原型验证: DTAgent CLI Team
- 核心实现: DTAgent CLI Team
- 文档编写: DTAgent CLI Team

## 时间线

- **2025-03-26**: 方案讨论、原型验证、核心实现、文档整理
- **总计**: 4 小时

## 后续计划

> **注意**：以下计划基于当前 async-lock 方案。

### 短期
- [x] 集成 async-lock 依赖
- [x] 删除 WorkspacePool 代码
- [x] 更新文档
- [ ] 回归测试验证

### 中期
- [ ] 性能基准测试
- [ ] 锁等待时间监控
- [ ] Unix/Mac 兼容性测试

### 长期
- [ ] 模块级锁（提升并发度）
- [ ] 分布式锁（支持多进程）

---

**最后更新**: 2025-04-06  
**方案状态**: async-lock（锁机制）已取代 WorkspacePool
