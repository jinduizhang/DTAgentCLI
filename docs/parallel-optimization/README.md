# 任务队列并行优化

本文档目录包含 DTAgent CLI 任务队列并行优化的完整记录。

## 目录结构

```
docs/parallel-optimization/
├── README.md              # 本文件
├── architecture.md        # 方案架构文档
├── changes.md             # 变更记录
└── process.md             # 优化过程记录
```

## 文档说明

### 📐 [架构文档](./architecture.md)

**内容**: 完整的系统架构设计

**包含**:
- 问题背景与解决方案
- 工作空间池设计
- 核心组件设计
- 并行执行流程
- 关键决策说明

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

采用**工作空间池**模式，实现 Maven 编译隔离：

```
.dtagent/workspace-pool/          # 工作空间池（batchSize 个槽位）
├── slot-0/                       # 槽位 0（复用）
│   ├── src -> /project/src      # 永久软链接
│   ├── pom.xml -> /project/pom.xml
│   ├── .m2/                     # 永久 .m2（依赖只下载一次）
│   └── target/ + src/test/      # 每次任务后清空
├── slot-1/                       # 槽位 1
├── slot-2/                       # 槽位 2
└── slot-3/                       # 槽位 3（假设 batchSize=4）
```

**核心特性**:
- ✅ 固定 batchSize 个槽位，不是每个任务一个
- ✅ 槽位复用：只清空 test/target，保留 src/pom/.m2
- ✅ 依赖只下载 batchSize 次
- ✅ 队列结束后删除整个池子

### 核心变更

**新增**:
- `src/core/workspace-manager.ts` - 工作空间池管理器

**修改**:
- `templates/plugins/task-manager.ts` - 集成工作空间池
- `templates/commands/generate-dt-dir.md` - 添加 `--batch-size` 参数
- `templates/commands/mr-ut.md` - 添加 `--batch-size` 参数
- `templates/commands/diff-ut.md` - 添加 `--batch-size` 参数
- `templates/commands/fix-ut.md` - 添加 `--batch-size` 参数

### 使用方法

```bash
# 串行执行（batchSize=1，不启用池子）
/task-create dir=src/main/java ext=java batchSize=1 prompt="..."

# 并行执行（batchSize=4，启用工作空间池）
/task-create dir=src/main/java ext=java batchSize=4 prompt="..."

# 或使用简写
/generate-dt-dir src/main/java/service --batch-size 4
/mr-ut --base main --batch-size 4
/diff-ut --base main --batch-size 4
/fix-ut src/test/java/service --batch-size 4
```

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
| 隔离方案 | 工作空间池 | 固定槽位复用，IO 最优 |
| 槽位数量 | batchSize | 与并行度一致，资源可控 |
| 复用策略 | 清空 test/target | 秒级切换，保留依赖 |
| 清理时机 | 队列结束 | 任务间复用，最终清理 |
| 触发条件 | batchSize > 1 | 向后兼容 |

## 兼容性

✅ **向后兼容**: batchSize=1 时行为不变

⚠️ **向前兼容**: Agent 需支持 `-Dmaven.repo.local` 参数

## 贡献者

- 方案设计: DTAgent CLI Team
- 原型验证: DTAgent CLI Team
- 核心实现: DTAgent CLI Team
- 文档编写: DTAgent CLI Team

## 时间线

- **2025-03-26**: 方案讨论、原型验证、核心实现、文档整理
- **总计**: 4 小时

## 后续计划

### 短期
- [ ] 集成测试
- [ ] Unix/Mac 兼容性测试
- [ ] README 文档更新

### 中期
- [ ] 依赖预下载优化
- [ ] 动态并行度调整
- [ ] 大项目 IO 优化

### 长期
- [ ] 分布式任务队列
- [ ] 云端工作空间

---

**最后更新**: 2025-03-26
