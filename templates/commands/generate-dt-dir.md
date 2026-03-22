---
description: 批量端到端测试生成 - 使用任务管理插件串行执行
---

# 批量端到端测试生成

扫描目录，使用任务管理插件串行执行端到端测试生成。

## 参数

- `{dir}` - 源文件目录路径（**必需**，无默认值）
- `--recursive` - 递归扫描子目录（可选）

## 使用

```
/generate-dt-dir src/main/java/service
/generate-dt-dir src/main/java/controller --recursive
```

## ⚠️ 参数校验

**`{dir}` 为必需参数，必须明确指定目录路径。**

如果未输入目录，输出提示：

```
❌ 请指定目录路径

用法: /generate-dt-dir <目录路径>

示例:
  /generate-dt-dir src/main/java/service
  /generate-dt-dir src/main/java/controller --recursive

提示: 建议指定具体模块目录，避免扫描过多文件
```

## 执行流程

### 1. 参数校验

检查 `{dir}` 是否提供：
- 未提供 → 输出提示并终止
- 提供 → 继续执行

### 2. 前置检查

- 检查 `DT_AGENTS.md` 是否存在
- 检查任务管理插件是否可用

### 3. 扫描目录

扫描指定目录获取所有 `.java` 源文件（排除 `*Test.java`）。

### 4. 创建任务队列

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

### 5. 启动任务并停止

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

打开 Session 选择器，查看每个文件的执行详情。

### 停止任务

```
task-stop
```

---

## 输出示例

```
✅ 任务队列已启动

目录: src/main/java/service
文件数: 15
执行方式: 串行（batchSize=1）

📌 后续操作：
- 查看进度: /task-status-dt
- 查看详情: /sessions
- 停止任务: task-stop

⚠️ 请勿关闭当前窗口
```

## 建议

- 指定具体模块目录（如 `src/main/java/service`）
- 避免使用过大范围（如 `src/main/java`）
- 分批处理大型项目