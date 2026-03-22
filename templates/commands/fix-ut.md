---
description: 修复失败的测试 - 单个测试类或批量修复
---

# 修复失败的测试

调用 `fix-java-ut` 技能分析测试失败原因并自动修复。

## 参数

- `{target}` - 测试类、测试方法或测试目录（必需）

## 使用

```
# 单个测试类
/fix-ut OrderServiceTest
/fix-ut src/test/java/service/OrderServiceTest.java

# 单个测试方法
/fix-ut OrderServiceTest#testCreateOrder

# 批量修复（目录）
/fix-ut src/test/java/service
```

## 参数识别规则

| 输入格式 | 识别为 | 执行方式 |
|---------|-------|---------|
| `ClassName` | 测试类 | 直接修复 |
| `ClassName#method` | 测试方法 | 直接修复 |
| `path/to/Test.java` | 测试文件 | 直接修复 |
| `path/to/dir` | 测试目录 | 批量修复（TaskManager） |

**识别逻辑**：
- 以 `.java` 结尾或包含 `#` → 单个测试类/方法
- 其他情况 → 测试目录

---

## 单个测试修复

**输入**：

```
/fix-ut OrderServiceTest
/fix-ut OrderServiceTest#testCreateOrder
```

**执行**：

加载 `fix-java-ut` 技能直接修复。

**输出**：

```
🔧 测试修复完成

测试: OrderServiceTest#testCreateOrder
问题: Mock 未正确设置
修复: 添加 when() 返回值
验证: ✅ 通过
```

---

## 批量测试修复

**输入**：

```
/fix-ut src/test/java/service
```

**执行流程**：

### 1. 读取 Maven 配置

先读取 `DT_AGENTS.md` 获取项目 Maven 配置：

- `settings` - 自定义 settings.xml 路径
- `profiles` - 激活的 profiles
- `jvmArgs` - JVM 参数

### 2. 整体编译验证

根据配置执行编译：

```
# 基础命令
mvn test-compile

# 带自定义 settings
mvn test-compile -s /path/to/settings.xml

# 带 profile
mvn test-compile -Pdev
```

**为什么先编译？**

- 多个测试文件可能存在编译错误
- 编译错误会影响后续测试运行
- 先修复编译错误，再修复运行时错误

### 3. 修复编译错误

如果有编译错误，加载 `fix-java-ut` 逐个修复，直到编译通过。

### 4. 扫描测试文件

扫描目录获取所有 `*Test.java` 文件。

### 5. 创建任务队列

```
task-create 
  dir="{dir}" 
  ext="java"
  pattern="*Test.java"
  batchSize=1
  prompt="加载 fix-java-ut 技能修复测试"
```

### 6. 启动任务

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

## 批量输出示例

```
📋 批量测试修复

步骤 1: 读取 Maven 配置
配置文件: DT_AGENTS.md
settings: /path/to/settings.xml
profiles: dev

步骤 2: 整体编译验证
运行: mvn test-compile -s /path/to/settings.xml -Pdev
结果: ❌ 编译失败

编译错误:
- OrderServiceTest.java: 缺少 import
- PaymentServiceTest.java: 类型不匹配

步骤 3: 修复编译错误
[1/2] OrderServiceTest.java ✅
[2/2] PaymentServiceTest.java ✅

步骤 4: 重新编译验证
运行: mvn test-compile -s /path/to/settings.xml -Pdev
结果: ✅ 编译通过

步骤 5: 创建修复任务队列
测试文件: 5 个

✅ 任务队列已启动

📌 后续操作：
- 查看进度: /task-status-dt
- 查看详情: /sessions
- 停止任务: task-stop

⚠️ 请勿关闭当前窗口
```

## 注意事项

1. **目录级修复先编译验证**，避免编译错误影响后续
2. 单个测试类直接修复，无任务队列
3. 自动识别参数类型，无需额外指定
4. 编译错误优先修复，再修复运行时错误