# DTAgent CLI 使用场景说明

## 概述

DTAgent 是基于 OpenCode 的 Java 单元测试生成工具，支持端到端测试生成流程：**生成 → 修复 → 覆盖率提升**。

## 命令速查表

### CLI 命令

| 命令 | 说明 |
|------|------|
| `dtagent init` | 初始化项目配置 |
| `dtagent init --decompile <packages>` | 初始化 + 反编译二方件 |
| `dtagent init --m2-repo <path>` | 指定 Maven 仓库路径 |
| `dtagent generate --file <path>` | 生成测试（CLI） |
| `dtagent extract-experience --dir <path> --save` | 提取经验 |

### OpenCode 斜杠命令

| 命令 | 说明 |
|------|------|
| `/init-dt` | 初始化项目 DT 配置 |
| `/generate-dt-single {file}` | 端到端单文件测试生成 |
| `/generate-dt-dir {dir}` | 批量端到端测试生成 |
| `/task-status-dt` | 查看批量任务进度 |
| `/mr-ut [--base BRANCH]` | MR 变更 UT 分析（已提交 MR） |
| `/diff-ut [--base BRANCH]` | 本地变更 UT 分析（提交前） |
| `/fix-ut {test}` | 修复失败的测试 |
| `/coverage [target]` | 分析测试覆盖率 |
| `/coverage-fill [--threshold N]` | 项目级覆盖率补齐 |
| `/extract-experience [target] --save` | 提取 Mock 经验 |

---

## 场景一：新项目接入

**目标**：为新项目配置 DTAgent。

**步骤**：

```bash
# 1. 初始化（推荐：指定二方件反编译范围）
dtagent init --decompile com.huawei.* --m2-repo D:/repository

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

二方件反编译: 3 个 jar, 648 个类
组件位置: .opencode/
配置文件: DT_AGENTS.md
默认代理: dtagent
```

---

## 场景二：二方件精准 Mock

**目标**：为二方件（公司内部依赖）生成精准 Mock。

**问题背景**：二方件没有公开文档，Mock 时方法签名容易写错。

**解决方案**：使用 CFR 反编译工具，从 jar 包中提取 API 签名。

### 初始化时反编译

```bash
# 指定二方件包范围和 Maven 仓库
dtagent init --decompile com.huawei.*,com.alibaba.* --m2-repo D:/00_code/repository
```

### 版本自动检测

```bash
# 再次执行时，版本未变化会跳过反编译
dtagent init --decompile com.huawei.* --m2-repo D:/repository

# 输出:
# ✓ 反编译完成: 0 新增, 3 跳过(版本未变化)
```

### 反编译结果

```
.dtagent/
├── deps/
│   ├── index.json                    # 类名 → 文件映射
│   ├── versions.json                 # 版本记录
│   └── fastjson-2.0.43/
│       └── com/alibaba/fastjson/
│           └── JSON.java             # 反编译文件
```

### 二方件识别规则

| 包名前缀 | 类型 | 处理方式 |
|---------|------|---------|
| `java.*`, `javax.*` | 标准库 | 直接使用 |
| `org.springframework.*` | 框架 | 有文档 |
| `org.apache.*`, `com.google.*` | 开源库 | 有文档 |
| `com.huawei.*`, `com.alibaba.*` | 二方件 | 使用反编译 |

---

## 场景三：单文件测试生成

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

## 场景四：批量测试生成

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

## 场景五：MR 变更 UT 补齐

**目标**：为已提交 MR 的变更代码补充测试。

**场景**：MR 已创建，代码审查时检查测试覆盖。

**步骤**：

```
/mr-ut --base origin/develop
```

**执行流程**：

1. 获取变更文件列表：`git diff --name-only origin/develop...HEAD`
2. 分析每个文件的变更方法
3. 创建任务队列
4. 串行执行端到端流程

**输出**：

```
📋 MR 变更 UT 分析

基准分支: origin/develop
目标分支: feature/order-service

变更统计:
- 新增文件: 2
- 修改文件: 3

✅ 任务队列已启动（文件列表模式）
```

---

## 场景六：本地变更 UT 分析

**目标**：为本地变更代码补充测试（提交前检查）。

**场景**：本地开发完成，提交前检查测试覆盖。

**步骤**：

```
/diff-ut                        # 工作区变更（未 commit）
/diff-ut --base main            # main...HEAD（已 commit 未 push）
```

**执行流程**：

1. 获取变更文件列表：`git diff --name-only main...HEAD`
2. 分析每个文件的变更方法
3. 创建任务队列
4. 串行执行端到端流程

**输出**：

```
📋 本地变更 UT 分析

模式: 本地分支对比（main...HEAD）

变更统计:
- 新增文件: 1
- 修改文件: 2

✅ 任务队列已启动
```

**典型工作流**：

```
本地开发完成
      ↓
/diff-ut                  # 检查本地变更测试覆盖
      ↓
git add . && git commit
      ↓
git push
      ↓
创建 MR
      ↓
/mr-ut --base origin/main  # MR 测试检查
```

---

## 场景七：修复失败的测试

**目标**：修复编译错误或测试失败。

**单个测试类**：

```
/fix-ut OrderServiceTest
/fix-ut OrderServiceTest#testCreateOrder
```

**批量修复（目录）**：

```
/fix-ut src/test/java/service
```

**参数识别**：

| 输入 | 识别为 | 执行方式 |
|------|-------|---------|
| `ClassName` | 测试类 | 直接修复 |
| `ClassName#method` | 测试方法 | 直接修复 |
| `path/to/Test.java` | 测试文件 | 直接修复 |
| `path/to/dir` | 测试目录 | 批量修复 |

**单个测试输出**：

```
🔧 测试修复完成

测试: OrderServiceTest#testCreateOrder
问题: Mock 未正确设置
修复: 添加 when() 返回值
验证: ✅ 通过
```

**批量修复流程**：

```
📋 批量测试修复

步骤 1: 整体编译验证
运行: mvn test-compile
结果: ❌ 编译失败

步骤 2: 修复编译错误
[1/2] OrderServiceTest.java ✅
[2/2] PaymentServiceTest.java ✅

步骤 3: 重新编译验证
结果: ✅ 编译通过

步骤 4: 创建修复任务队列
测试文件: 5 个

✅ 任务队列已启动
```

**为什么先编译？**

- 多个测试文件可能有编译错误
- 编译错误会影响后续测试运行
- 先修复编译错误，再修复运行时错误

---

## 场景八：覆盖率分析

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

## 场景九：项目级覆盖率补齐

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

## 场景十：提取 Mock 经验

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

`/generate-dt-single`、`/generate-dt-dir`、`/mr-ut`、`/diff-ut` 都执行相同的端到端流程：

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