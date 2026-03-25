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
| `path/to/dir` | 测试目录 | 批量修复 |

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

## 批量测试修复（目录级）

**输入**：

```
/fix-ut src/test/java/service
```

### 执行流程

#### 1. 读取 Maven 配置

**必须从 `DT_AGENTS.md` 读取 Maven 命令，禁止硬编码**：

```
if (DT_AGENTS.md 不存在) {
  执行 /init-dt
}

从 DT_AGENTS.md 读取:
- 编译命令
- 单个测试命令
- 目录测试命令（包级）
```

**禁止事项**：
- ❌ 不准使用默认的 `mvn test-compile`
- ❌ 不准使用默认的 `mvn test`
- ✅ 必须使用 DT_AGENTS.md 中的命令

#### 2. 编译验证

使用从 DT_AGENTS.md 读取的编译命令。

**编译失败**：
- 解析编译错误
- 找出有编译错误的测试文件
- 逐个调用 `fix-java-ut` 修复
- 循环直到编译通过

#### 3. 运行目录测试

使用从 DT_AGENTS.md 读取的目录测试命令。

**获取失败测试类**：
- 解析测试报告
- 提取失败的测试类名列表
- 记录每个类的失败原因

#### 4. 创建修复任务队列

**只针对失败的测试类**：

```
失败的测试类:
- OrderServiceTest (3 failures)
- PaymentServiceTest (1 failure)
- UserServiceTest (2 failures)

创建任务队列:
task-create-files '[
  {"filename": "src/test/java/service/OrderServiceTest.java", "prompt": "加载 fix-java-ut 技能修复测试", "metadata": {"failures": 3}},
  {"filename": "src/test/java/service/PaymentServiceTest.java", "prompt": "加载 fix-java-ut 技能修复测试", "metadata": {"failures": 1}},
  {"filename": "src/test/java/service/UserServiceTest.java", "prompt": "加载 fix-java-ut 技能修复测试", "metadata": {"failures": 2}}
]'
```

#### 5. 启动任务

```
task-start
```

**启动后立即停止，不循环查询状态。**

---

## 子模块项目处理

### 识别子模块

从 `DT_AGENTS.md` 读取子模块信息：

```
## 项目结构

模块:
- module-a
- module-b

测试路径:
- module-a/src/test/java
- module-b/src/test/java
```

### 跨模块测试运行

```
# 运行指定模块的测试
mvn test -pl module-a -Dtest="com.example.*"

# 运行所有模块的测试
mvn test -Dtest="com.example.*"
```

### 任务队列包含模块信息

```
task-create-files '[
  {"filename": "module-a/src/test/java/OrderServiceTest.java", "prompt": "..."},
  {"filename": "module-b/src/test/java/PaymentServiceTest.java", "prompt": "..."}
]'
```

---

## 输出示例

```
📋 批量测试修复

步骤 1: 读取 Maven 配置
配置文件: DT_AGENTS.md
编译命令: mvn test-compile -s /path/to/settings.xml -Pdev
目录测试命令: mvn test -Dtest="com.example.service.*"

步骤 2: 编译验证
运行: mvn test-compile -s /path/to/settings.xml -Pdev
结果: ✅ 编译通过

步骤 3: 运行目录测试
运行: mvn test -Dtest="com.example.service.*" -s /path/to/settings.xml -Pdev
结果: ❌ 5 个测试类失败

失败测试类:
- OrderServiceTest: 3 failures
- PaymentServiceTest: 1 failure
- UserServiceTest: 2 failures
- InventoryServiceTest: 1 failure
- NotificationServiceTest: 1 failure

步骤 4: 创建修复任务队列
任务数: 5 个
并行数: 1

✅ 任务队列已启动

📌 后续操作：
- 查看进度: /task-status-dt
- 查看详情: /sessions
- 停止任务: task-stop

⚠️ 请勿关闭当前窗口
```

---

## 注意事项

1. **先编译再运行**：确保代码可编译后再运行测试
2. **只修复失败测试**：不修复已通过的测试，节省时间
3. **子模块支持**：正确处理多模块项目的测试路径
4. **配置从 DT_AGENTS.md 读取**：不使用默认命令