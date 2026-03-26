---
description: 批量端到端测试生成 - 使用任务管理插件串行或并行执行
tools: [task-create, task-start]
---

# 批量端到端测试生成

扫描目录，使用任务管理插件执行端到端测试生成。支持串行（batchSize=1）或并行（batchSize>1）执行。

## 参数

- `{dir}` - 源文件目录路径（**必需**，无默认值）
- `--recursive` - 递归扫描子目录（可选）
- `--batch-size <n>` - 并行数，默认为 1（串行），设为 4 可并行执行 4 个任务（可选）

## 使用

```
# 串行执行（默认）
/generate-dt-dir src/main/java/service

# 递归扫描
/generate-dt-dir src/main/java/controller --recursive

# 并行执行 4 个任务（自动启用工作空间隔离）
/generate-dt-dir src/main/java/service --batch-size 4
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
  /generate-dt-dir src/main/java/service --batch-size 4

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
  batchSize={batchSize}  // 默认 1，可通过 --batch-size 指定
  prompt="执行端到端测试生成：
    1. 加载 generate-java-ut 生成测试
    2. 加载 fix-java-ut 修复测试
    3. 加载 java-coverage 提升覆盖率
    源文件: {filepath}"
```

**注意**: 当 batchSize > 1 时，系统会自动创建工作空间隔离，避免 Maven 编译冲突。

### 5. 启动任务并停止

```
task-start
```

**启动后立即停止，不循环查询状态。**

---

## 串行 vs 并行

### 串行执行（batchSize=1）

```
/generate-dt-dir src/main/java/service
```

- 一个任务完成后才开始下一个
- 不创建工作空间
- 适合少量文件或资源受限场景

### 并行执行（batchSize>1）

```
/generate-dt-dir src/main/java/service --batch-size 4
```

- 同时执行多个任务
- 自动创建独立工作空间（每个任务独立目录 + 独立 .m2）
- 避免 Maven 编译冲突
- 适合多核 CPU、大量文件场景

**推荐 batchSize**: 
- CPU 4 核 → batchSize=3
- CPU 8 核 → batchSize=6
- 默认: 1（串行）

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

### 串行模式

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

### 并行模式

```
✅ 任务队列已启动

目录: src/main/java/service
文件数: 15
执行方式: 并行（batchSize=4）
隔离模式: 工作空间隔离（自动启用）

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
- 并行执行需要足够的磁盘空间（每个任务约 100-500MB）