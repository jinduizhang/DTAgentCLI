---
name: cwd-ut-protection
description: 基于CWD编号的UT防护测试生成，用户输入方法地址和CWD编号，系统针对已修复代码生成全方位测试防护
compatibility: opencode
metadata:
  language: java
  framework: junit5
---

## 功能

为**已修复的代码**提供基于 CWD 编号的 UT 防护测试生成能力。

**前提条件**: 代码已经修复完成，本 skill 仅生成防护测试，不修复代码。

用户输入方法地址和 CWD 编号，系统自动：
1. 查找问题库获取 CWD 问题定义
2. 定位已修复的问题代码
3. 基于 CWD 测试防护维度生成全方位测试
4. 运行测试验证防护有效性

## 依赖 Skills

本 skill 依赖以下 skills，**必须先加载**：

### 1. generate-java-ut
**用途**: 生成 JUnit 5 单元测试
**复用内容**:
- 分析目标类结构
- 识别依赖和二方件
- 生成精准 Mock
- 应用测试模板

**调用方式**:
```
读取 templates/skills/generate-java-ut/SKILL.md
应用其执行步骤 1-7
```

### 2. fix-java-ut
**用途**: 编译验证和运行验证，修复测试代码
**复用内容**:
- 编译验证循环（必须成功）
- 运行验证循环（最多10次）
- 错误解析和修复策略

**调用方式**:
```
读取 templates/skills/fix-java-ut/SKILL.md
应用其执行步骤 1-4
```

## 执行步骤

### 1. 读取项目配置

**必须从 `DT_AGENTS.md` 读取 Maven 命令**（复用 fix-java-ut 逻辑）：

```
if (DT_AGENTS.md 不存在) {
  执行 /init-dt 技能初始化
}

从 DT_AGENTS.md 读取:
- 编译命令: mvn test-compile [参数]
- 运行命令: mvn test -Dtest={ClassName} [参数]
```

### 2. 解析用户输入

**输入格式**：
```
方法地址: com.example.UserService#updateUser
CWD 编号: CWD-1001
```

**解析逻辑**：
```
1. 提取类名: com.example.UserService
2. 提取方法名: updateUser
3. 提取 CWD 编号: CWD-1001
4. 验证格式有效性
```

### 3. 查找问题库

**读取 `.opencode/problems.json`**：

```
1. 读取问题库文件
2. 根据 CWD 编号查找问题定义
3. 提取:
   - name: 问题名称
   - description: 问题描述
   - testDimensions: 测试防护维度（数组）
4. 如果找不到 CWD 编号 → 报错并提示用户检查问题库
```

### 4. 定位已修复代码

**定位逻辑**：

```
1. 根据类名和方法名定位代码文件
   - 搜索 src/main/java/ 目录
   - 使用 LSP goto definition 或文本搜索
   
2. 读取目标方法代码
   - 提取方法体
   - 分析依赖和调用
   
3. 确认代码已修复
   - 检查代码是否符合问题库定义的预期
   - 如果未修复 → 提示用户先修复代码
```

### 5. 生成防护测试

**复用 `/generate-java-ut` 的测试生成逻辑**：

生成流程：
```
1. 基于测试防护维度生成测试
   - 从 testDimensions 提取维度定义
   - 每个维度生成对应的测试方法
   
2. 调用 generate-java-ut 的逻辑（复用）
   - 分析目标类结构（复用 generate-java-ut 步骤2）
   - 识别依赖和二方件（复用 generate-java-ut 步骤3）
   - 生成精准 Mock（复用 generate-java-ut 步骤5）
   - 应用测试模板（复用 generate-java-ut 步骤6）
   
3. 测试维度映射机制
   - testDimensions → 测试策略 → 测试代码
```

**测试维度映射**：
```
对于每个 testDimension:
  1. dimension → 测试方法名称
     示例: "维度名称" → test{DimensionName}()
     
  2. testStrategy → 测试逻辑
     示例: "测试策略描述" → 具体的断言和验证
     
  3. testCases → 测试场景
     示例: ["场景1", "场景2"] → 多个测试方法
```

**生成示例**（基于 problems.json 的维度）：
```java
// 对于每个 testDimension，生成对应的测试方法
@Test
void test{DimensionName}_{TestCaseName}() {
    // 基于 testStrategy 实现测试逻辑
    // 基于 testCase 定义具体测试场景
    // ...测试代码...
}
```
    UserVO target = new UserVO();
    
    assertThatThrownBy(() -> {
        BeanUtils.copyProperties(source, target);
    }).isInstanceOf(IllegalArgumentException.class);
}
```

### 6. 运行测试验证

**复用 `/fix-java-ut` 的验证逻辑**：

验证流程：
```
1. 运行 mvn test -Dtest={TestClass}（复用 fix-java-ut 步骤3）
2. 检查测试结果
   - 所有测试通过 → 防护测试生成成功
   - 有测试失败 → 分析原因并调整测试代码
   
3. 如果失败 → 循环修复测试代码（最多10次，复用 fix-java-ut 步骤3）
   - 分析失败原因
   - 调整测试代码（不修改源代码）
   - 重新运行
```

---

## 测试防护维度

### 什么是测试防护维度？

测试防护维度是对特定问题类型进行全方位测试防护的多个维度。每个维度代表一个需要验证的场景或边界条件，确保问题修复后不会再次出现类似问题。

### 维度来源

测试防护维度**从问题库读取**，不在此 skill 中硬编码。

**读取路径**: `.opencode/problems.json`

**问题库结构**:
```json
{
  "problems": {
    "CWD-XXXX": {
      "name": "问题名称",
      "description": "问题描述",
      "testDimensions": [
        {
          "dimension": "维度名称",
          "testStrategy": "测试策略",
          "testCases": ["场景1", "场景2"]
        }
      ]
    }
  }
}
```

### 维度结构说明

每个 `testDimension` 包含：

| 字段 | 说明 | 用途 |
|------|------|------|
| `dimension` | 维度名称 | 生成测试方法名 |
| `testStrategy` | 测试策略 | 定义测试逻辑 |
| `testCases` | 测试场景列表 | 生成具体测试用例 |

### 维度映射机制

```
testDimension → 测试代码

1. dimension → 测试方法名
   示例: "拷贝方向正确性" → testCopyDirectionCorrectness()

2. testStrategy → 测试逻辑
   示例: "验证属性从源正确拷贝到目标" → 断言目标对象属性

3. testCases → 测试场景
   示例: ["正向拷贝", "反向拷贝"] → 两个测试方法
```

### 示例：从 problems.json 读取维度

**问题库定义** (`.opencode/problems.json`):
```json
{
  "problems": {
    "CWD-1001": {
      "testDimensions": [
        {
          "dimension": "拷贝方向正确性",
          "testStrategy": "验证属性从源正确拷贝到目标",
          "testCases": ["正向拷贝", "反向拷贝"]
        }
      ]
    }
  }
}
```

**生成的测试**:
```java
@Test
void testCopyDirectionCorrectness_forward() {
    // 基于 testCase: "正向拷贝"
    // 应用 testStrategy: "验证属性从源正确拷贝到目标"
}

@Test
void testCopyDirectionCorrectness_backward() {
    // 基于 testCase: "反向拷贝"
    // 应用 testStrategy: "验证属性从源正确拷贝到目标"
}
```

---

## 输入格式与解析

### 输入格式规范

**完整格式**：
```
方法地址: <完整类名>#<方法名>
CWD 编号: CWD-XXXX
```

**示例**：
```
方法地址: com.example.config.util.UserConverter#convertToVO
CWD 编号: CWD-1001
```

### 方法地址格式

| 格式 | 示例 | 说明 |
|------|------|------|
| 类名#方法名 | `com.example.UserService#updateUser` | 定位具体方法 |
| 仅类名 | `com.example.UserService` | 定位整个类 |

### CWD 编号格式

**格式规则**：
```
CWD-XXXX
```

- **前缀**: 固定为 `CWD`
- **编号**: 4位数字（如 1001, 1002）

---

## 使用示例

### 示例：为已修复代码生成防护测试

**场景**: 某方法已修复，需要生成防护测试防止问题再次出现

**输入**:
```
方法地址: com.example.config.util.UserConverter#convertToVO
CWD 编号: CWD-1001
```

**执行流程**:
```
1. 读取 .opencode/problems.json → 找到 CWD-1001 定义
2. 定位 UserConverter#convertToVO 方法
3. 确认代码已修复
4. 从 CWD-1001 的 testDimensions 读取测试防护维度
5. 基于每个维度生成对应的测试方法（调用 generate-java-ut）
6. 运行 mvn test 验证（调用 fix-java-ut）
7. 所有测试通过 → 防护测试生成成功
```

**维度读取示例**:
```json
// 从 problems.json 读取 CWD-1001 的 testDimensions
{
  "dimension": "拷贝方向正确性",
  "testStrategy": "验证属性从源正确拷贝到目标",
  "testCases": ["正向拷贝", "反向拷贝"]
}
```

**生成的测试**（基于维度动态生成）：
```java
@Test
void testCopyDirectionCorrectness_forward() {
    // 基于 testCase: "正向拷贝"
    // 应用 testStrategy: "验证属性从源正确拷贝到目标"
    // ...测试逻辑...
}

@Test
void testCopyDirectionCorrectness_backward() {
    // 基于 testCase: "反向拷贝"
    // 应用 testStrategy: "验证属性从源正确拷贝到目标"
    // ...测试逻辑...
}
```

---

## 核心保证

**继承 fix-java-ut 的核心保证**：

- **编译必须成功** - 生成的测试代码必须可编译
- **运行最多10次** - 测试失败时循环修复测试代码（不修改源代码）
- **最终代码可编译** - 无论测试是否通过，测试代码都能编译

**重要约束**：

- ✅ **仅生成测试代码** - 不修改源代码
- ✅ **代码已修复前提** - 假设源代码已经正确修复
- ✅ **防护测试目的** - 防止相同问题再次出现
