---
description: 批量端到端测试生成 - 使用任务管理插件串行执行
---

# 批量端到端测试生成

扫描目录，使用任务管理插件串行执行端到端测试生成。

## 参数

- `{dir}` - 源文件目录路径（必需）
- `--recursive` - 递归扫描子目录（可选）

## 使用

```
/generate-dt-dir src/main/java/service
/generate-dt-dir src/main/java --recursive
```

## 执行流程

### 1. 前置检查

- 检查 `DT_AGENTS.md` 是否存在
- 检查任务管理插件是否可用

### 2. 扫描目录

扫描目录获取所有 `.java` 源文件（排除 `*Test.java`）。

### 3. 创建任务队列

```
task-create 
  dir="{dir}" 
  ext="java" 
  recursive=true/false
  batchSize=1
  prompt="执行端到端测试生成：
    1. 加载 generate-java-ut 生成测试
    2. 加载 fix-java-ut 修复测试
    3. 加载 java-coverage 提升覆盖率
    源文件: {filepath}"
```

### 4. 启动任务并停止

```
task-start
```

**启动后立即停止，不循环查询状态。**

---

## ⚠️ 启动后的操作说明

任务已启动，后台自动串行执行。**请勿关闭当前窗口。**

### 查看进度

```
/task-status-dt
```

### 停止任务

```
task-stop
```

### 切换 Session 查看

在 OpenCode 右侧任务栏点击对应 Session 查看单个文件的执行详情。

---

## 输出示例

```
✅ 任务队列已启动

目录: src/main/java/service
文件数: 15
执行方式: 串行（batchSize=1）

📌 后续操作：
- 查看进度: /task-status-dt
- 停止任务: task-stop
- 查看 Session: 右侧任务栏

⚠️ 请勿关闭当前窗口
```