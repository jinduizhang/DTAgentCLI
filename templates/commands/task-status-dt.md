---
description: 任务状态查看 - 查看批量任务执行进度和结果
---

# 任务状态查看

查看 `/generate-dt-dir` 启动的批量任务执行状态。

## 使用

```
/task-status-dt
```

## 执行

调用 `task-status` 工具获取当前队列状态。

## 输出格式

### 执行中

```
📊 任务执行中

进度: 5/15 (33%)
成功: 4
失败: 1
当前: OrderService.java

已完成:
✅ UserService.java
✅ ConfigService.java  
✅ DataService.java
✅ LogService.java
❌ CacheService.java (Mock注入失败)
```

### 已完成

```
📊 任务执行完成

总数: 15
成功: 12
失败: 3

成功文件:
✅ OrderService.java → OrderServiceTest.java (覆盖率 85%)
✅ UserService.java → UserServiceTest.java (覆盖率 78%)
...

失败文件:
❌ CacheService.java - Mock注入失败
❌ PaymentService.java - 编译错误
❌ NotifyService.java - 超时

📌 失败文件可使用 /generate-dt-single 单独重新生成
```

### 未启动

```
📊 无正在执行的任务

启动任务: /generate-dt-dir <目录>
```