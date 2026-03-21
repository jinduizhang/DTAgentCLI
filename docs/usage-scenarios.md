# DTAgent CLI 使用场景说明

## 概述

DTAgent 是基于 OpenCode 的 Java 单元测试生成工具，支持端到端测试生成流程：**生成 → 修复 → 覆盖率提升**。

## 命令速查表

### CLI 命令

| 命令 | 说明 |
|------|------|
| `dtagent init [file]` | 初始化项目配置 |
| `dtagent generate --file <path>` | 生成测试（CLI） |
| `dtagent extract-experience --dir <path> --save` | 提取经验 |

### OpenCode 斜杠命令

| 命令 | 说明 |
|------|------|
| `/init-dt` | 初始化项目 DT 配置 |
| `/generate-dt-single {file}` | 端到端单文件测试生成 |
| `/generate-dt-dir {dir}` | 批量端到端测试生成 |
| `/task-status-dt` | 查看批量任务进度 |
| `/mr-ut [--base BRANCH]` | MR 变更 UT 分析 |
| `/fix-ut {test}` | 修复失败的测试 |
| `/coverage [target]` | 分析测试覆盖率 |
| `/coverage-fill [--threshold N]` | 项目级覆盖率补齐 |
| `/extract-experience [target] --save` | 提取 Mock 经验 |

---

## 场景一：新项目接入

**目标**：为新项目配置 DTAgent。

**步骤**：

```bash
# 1. 初始化
dtagent init

# 2. 启动 OpenCode
opencode

# 3. 在 OpenCode 中执行
/init-dt
```

**输出**：

```
✅ 初始化完成

项目类型: MAVEN
JUnit: 5.9.3
Mockito: 5.4.0

组件位置: .opencode/
配置文件: DT_AGENTS.md
默认代理: dtagent
```

---

## 场景二：单文件测试生成

**目标**：为单个 Java 类生成单元测试。

**步骤**：

```
/generate-dt-single src/main/java/service/OrderService.java
```

**执行流程**：

```
1. generate-java-ut  → 生成测试
2. fix-java-ut       → 修复测试
3. java-coverage     → 提升覆盖率
```

**输出**：

```
🎉 端到端测试生成完成

源文件: OrderService.java
测试文件: OrderServiceTest.java

阶段:
✅ 测试生成
✅ 测试修复
✅ 覆盖率提升

测试用例: 8 个
覆盖率: 82%
```

---

## 场景三：批量测试生成

**目标**：为目录下所有 Java 类生成测试。

**步骤**：

```
/generate-dt-dir src/main/java/service --recursive
```

**执行流程**：

1. 扫描目录获取所有 `.java` 文件
2. 创建任务队列
3. 串行执行每个任务

**启动后停止，使用以下命令查看进度**：

```
/task-status-dt
```

**输出**：

```
📊 队列状态

模式: 目录扫描
运行中: ✅
总计: 15
成功: 10
失败: 0
待执行: 5

🔄 正在执行: PaymentService.java
```

---

## 场景四：MR 变更 UT 补齐

**目标**：为 MR 中的变更代码补充测试。

**步骤**：

```
/mr-ut --base develop
```

**执行流程**：

1. 获取变更文件列表：`git diff --name-only origin/develop...HEAD`
2. 分析每个文件的变更方法
3. 创建任务队列
4. 串行执行端到端流程

**输出**：

```
📋 MR 变更 UT 分析

基准分支: develop
目标分支: feature/order-service

变更统计:
- 新增文件: 2
- 修改文件: 3

变更详情:
┌─────────────────────┬──────────┬─────────────────┐
│ 文件                │ 类型     │ 变更方法        │
├─────────────────────┼──────────┼─────────────────┤
│ OrderService.java   │ 修改     │ +createOrder    │
│ PaymentService.java │ 修改     │ ~processPayment │
└─────────────────────┴──────────┴─────────────────┘

✅ 任务队列已启动（文件列表模式）
```

---

## 场景五：修复失败的测试

**目标**：修复编译错误或测试失败。

**步骤**：

```
/fix-ut OrderServiceTest
/fix-ut OrderServiceTest#testCreateOrder
```

**输出**：

```
🔧 测试修复完成

测试: OrderServiceTest#testCreateOrder
问题: Mock 未正确设置
修复: 添加 when() 返回值
验证: ✅ 通过
```

---

## 场景六：覆盖率分析

**目标**：分析项目测试覆盖率，找出测试盲区。

**步骤**：

```
/coverage
/coverage com.example.service
/coverage --threshold 80
```

**输出**：

```
📊 测试覆盖率分析

总体覆盖率: 72%

测试盲区:
❌ OrderController
   - createOrder(): 无测试
   - updateOrder(): 无测试

⚠️ UserService
   - updateUser(): 缺少异常测试
```

---

## 场景七：项目级覆盖率补齐

**目标**：将项目覆盖率提升到目标值。

**步骤**：

```
/coverage-fill --threshold 80
```

**执行流程**：

1. 运行覆盖率报告
2. 识别低覆盖区域
3. 按价值排序（Service > Controller > DTO）
4. 批量生成测试

**输出**：

```
📊 项目级覆盖率 UT 补齐

初始覆盖率: 45%
目标覆盖率: 80%

执行计划:
[1/6] OrderServiceTest.java ✅
[2/6] PaymentServiceTest.java ✅
...

最终覆盖率: 82% ✅
覆盖率提升: +37%
```

---

## 场景八：提取 Mock 经验

**目标**：从现有测试中提取 Mock 模式，用于指导后续生成。

**步骤**：

```
/extract-experience src/test/java --save
```

**输出**：

```
📋 Mock 经验提取完成

扫描文件: 25 个
提取模式: 12 个

新增经验:
1. DiamondClient Mock
2. OrderRepository Mock

✅ Saved to .opencode/skills/generate-java-ut/experiences/
```

**经验应用**：

生成测试时会自动匹配经验：

```
代码中 import com.alibaba.diamond.DiamondClient
    → 匹配 diamondclient-mock.md
    → 应用 Mock 模式
```

---

## 端到端流程说明

`/generate-dt-single`、`/generate-dt-dir`、`/mr-ut` 都执行相同的端到端流程：

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  generate-java-ut   │ →  │    fix-java-ut      │ →  │   java-coverage     │
│     生成测试        │    │    修复失败测试     │    │   提升覆盖率        │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

| 阶段 | 技能 | 功能 |
|------|------|------|
| 1 | generate-java-ut | 分析源码，生成测试用例 |
| 2 | fix-java-ut | 修复编译错误和测试失败 |
| 3 | java-coverage | 分析覆盖率，补充测试 |

---

## 经验库管理

### 经验存储位置

```
.opencode/skills/generate-java-ut/experiences/
├── README.md       # 使用说明
├── template.md     # 经验模板
├── mockito.md      # Mockito 框架经验
└── your-custom.md  # 自定义经验
```

### 添加经验

**方式一：自动提取**

```
/extract-experience src/test/java --save
```

**方式二：手动添加**

1. 复制模板：`cp template.md my-mock.md`
2. 编辑填写
3. 保存生效

### 经验格式

```markdown
---
title: 经验标题
type: 二方件Mock
tags: [tag1, tag2]
---

## 适用场景
描述什么情况下使用

## 代码示例
@Mock
private YourDependency dependency;

## 注意事项
- 注意点
```

---

## 注意事项

1. **批量任务启动后不会循环查询**，使用 `/task-status-dt` 手动查看进度
2. **修复测试由 fix-java-ut 技能自动处理**，无需指定测试命令
3. **经验文件放在 `generate-java-ut/experiences/`** 目录
4. **内网项目**可在 `DT_AGENTS.md` 配置自定义 Maven settings