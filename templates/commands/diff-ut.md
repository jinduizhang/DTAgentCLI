---
description: 本地变更 UT 分析 - 基于 Git Diff 分析本地变更并生成测试
---

# 本地变更 UT 分析

基于 Git Diff 分析本地变更代码，为新增或修改的方法生成测试。

**适用场景**：提交代码前，本地检查测试覆盖。

## 参数

- `--base BRANCH` - 基准分支（可选，默认 main）
- 不传 `--base` - 分析工作区变更（未 commit 的修改）

## 使用

```
/diff-ut                        # 工作区变更（未 commit）
/diff-ut --base main            # main...HEAD（已 commit 未 push）
/diff-ut --base develop         # develop...HEAD
```

## 与 /mr-ut 的区别

| 命令 | 场景 | Git 操作 |
|------|------|---------|
| `/mr-ut` | 已提交 MR | `git diff origin/main...HEAD` |
| `/diff-ut` | 本地变更 | `git diff main...HEAD` 或 `git diff` |

## 执行流程

### 1. 获取变更文件

```bash
# 指定 base 分支
git diff --name-only {base}...HEAD -- "*.java"

# 不指定 base（工作区变更）
git diff --name-only -- "*.java"
```

过滤出 `.java` 文件，排除 `*Test.java`。

### 2. 分析每个文件的变更

解析变更类型：
- **A (Added)** - 新增文件 → 全量生成测试
- **M (Modified)** - 修改文件 → 分析新增/修改的方法
- **D (Deleted)** - 删除文件 → 跳过

### 3. 创建任务队列

使用 `task-create-files` 创建任务队列，每个任务执行端到端流程：

```json
[
  {
    "filename": "src/main/java/OrderService.java",
    "prompt": "【变更测试生成】\n\n变更类型：修改\n变更方法：+createOrder(), ~updateOrder()\n\n执行端到端流程：\n1. 加载 generate-java-ut 生成测试\n2. 加载 fix-java-ut 修复测试\n3. 加载 java-coverage 提升覆盖率",
    "metadata": {
      "changeType": "modified",
      "methods": ["+createOrder", "~updateOrder"]
    }
  }
]
```

### 4. 启动任务

```
task-start
```

**启动后立即停止，不循环查询状态。**

---

## 启动后的操作

### 查看进度

```
/task-status-dt
```

### 查看执行详情

```
/sessions
```

### 停止任务

```
task-stop
```

---

## 输出示例

```
📋 本地变更 UT 分析

模式: 工作区变更（未 commit）
或
模式: 本地分支对比（main...HEAD）

变更统计:
- 新增文件: 2
- 修改文件: 3

变更详情:
┌─────────────────────────┬──────────┬─────────────────────────┐
│ 文件                    │ 类型     │ 变更方法                │
├─────────────────────────┼──────────┼─────────────────────────┤
│ OrderService.java       │ 修改     │ +createOrder            │
│ PaymentService.java     │ 修改     │ ~processPayment         │
└─────────────────────────┴──────────┴─────────────────────────┘

✅ 任务队列已启动

总任务: 2
执行方式: 串行

📌 后续操作：
- 查看进度: /task-status-dt
- 查看详情: /sessions
- 停止任务: task-stop

⚠️ 请勿关闭当前窗口
```

## 典型工作流

```
1. 本地开发完成
      ↓
2. /diff-ut              # 检查本地变更测试覆盖
      ↓
3. git add . && git commit
      ↓
4. git push
      ↓
5. 创建 MR
      ↓
6. /mr-ut --base origin/main  # MR 测试检查
```

## 注意事项

1. 不传 `--base` 时分析工作区变更（未 commit 的修改）
2. 传 `--base` 时分析已 commit 未 push 的变更
3. 每个任务执行完整端到端流程：**生成 → 修复 → 覆盖率提升**