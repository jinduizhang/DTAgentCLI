---
description: MR 变更 UT 分析 - 基于 Git Diff 分析变更代码并生成测试
---

# MR 变更 UT 分析

基于 Git Diff 分析变更代码，为新增或修改的方法生成测试。

## 参数

- `--base BRANCH` - 基准分支（默认 main）
- `--target BRANCH` - 目标分支（默认当前分支）

## 使用

```
/mr-ut
/mr-ut --base develop
/mr-ut --base main --target feature/order
```

## 执行流程

### 1. 获取变更文件

```bash
git diff --name-only origin/{base}...HEAD -- "*.java"
```

过滤出 `.java` 文件，排除 `*Test.java`。

### 2. 分析每个文件的变更

对每个变更文件执行：

```bash
git diff origin/{base}...HEAD -- path/to/File.java
```

解析变更类型：
- **A (Added)** - 新增文件 → 全量生成测试
- **M (Modified)** - 修改文件 → 分析新增/修改的方法
- **D (Deleted)** - 删除文件 → 跳过

### 3. 识别变更方法

对于修改的文件，识别：
- 新增的方法
- 修改的方法体
- 新增的分支（if/else）

### 4. 创建任务队列

使用 `task-create-files` 创建任务队列，每个任务执行端到端流程：

```json
[
  {
    "filename": "src/main/java/OrderService.java",
    "prompt": "【MR 变更测试生成】\n\n变更类型：修改\n变更方法：+createOrder(), ~updateOrder()\n\n执行端到端流程：\n1. 加载 generate-java-ut 生成测试\n2. 加载 fix-java-ut 修复测试\n3. 加载 java-coverage 提升覆盖率",
    "metadata": {
      "changeType": "modified",
      "methods": ["+createOrder", "~updateOrder"]
    }
  }
]
```

### 5. 启动任务并停止

```
task-start
```

**启动后立即停止，不循环查询状态。**

---

## ⚠️ 启动后的操作说明

任务已启动，后台自动执行。**请勿关闭当前窗口。**

### 查看进度

```
/task-status-dt
```

### 停止任务

```
task-stop
```

---

## 输出示例

```
📋 MR 变更 UT 分析

基准分支: main
目标分支: feature/order-service

变更统计:
- 新增文件: 2
- 修改文件: 3
- 删除文件: 1

变更详情:
┌─────────────────────────┬──────────┬─────────────────────────┐
│ 文件                    │ 类型     │ 变更方法                │
├─────────────────────────┼──────────┼─────────────────────────┤
│ OrderService.java       │ 修改     │ +createOrder            │
│                         │          │ ~updateOrder            │
│ PaymentService.java     │ 修改     │ ~processPayment         │
│ OrderController.java    │ 新增     │ 全量生成                │
└─────────────────────────┴──────────┴─────────────────────────┘

✅ 任务队列已启动（文件列表模式）

总任务: 3
执行方式: 串行（每个任务包含生成→修复→覆盖率提升）

📌 后续操作：
- 查看进度: /task-status-dt
- 停止任务: task-stop
- 查看 Session: 右侧任务栏

⚠️ 请勿关闭当前窗口
```

## MR 报告

任务完成后生成报告：`.dtagent/reports/mr-ut-report.md`

```markdown
# MR 测试报告

**分支**: feature/order-service → main
**时间**: 2026-03-22

## 变更概览

| 文件 | 类型 | 变更方法 | 测试状态 | 覆盖率 |
|------|------|----------|----------|--------|
| OrderService.java | 修改 | +createOrder, ~updateOrder | ✅ 已生成 | 85% |
| PaymentService.java | 修改 | ~processPayment | ✅ 已生成 | 78% |
| OrderController.java | 新增 | 全量生成 | ✅ 已生成 | 82% |

## 执行详情

### OrderService.java
- ✅ 测试生成: OrderServiceTest.java
- ✅ 测试修复: 2 个问题已修复
- ✅ 覆盖率提升: 45% → 85%

### PaymentService.java
- ✅ 测试生成: PaymentServiceTest.java
- ✅ 测试修复: 通过
- ✅ 覆盖率提升: 60% → 78%

### OrderController.java
- ✅ 测试生成: OrderControllerTest.java
- ✅ 测试修复: 通过
- ✅ 覆盖率提升: 0% → 82%

## 建议

1. OrderService.createOrder() - 复杂业务逻辑，建议人工审查
2. PaymentService.processPayment() - 涉及支付，建议增加边界测试
```

## 注意事项

1. 只处理 `.java` 文件，排除测试文件
2. 每个任务执行完整端到端流程：**生成 → 修复 → 覆盖率提升**
3. 新增文件全量生成，修改文件针对变更方法
4. 建议在 MR 创建时触发此命令