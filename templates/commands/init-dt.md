---
description: 初始化项目 DT 配置 - 检测框架，提取 Maven 配置，生成 DT_AGENTS.md
---

# 初始化项目 DT 配置

初始化 Java 项目的测试框架配置，生成 `DT_AGENTS.md`。

## 参数

- `{file}` - 可选，指定 pom.xml 或 build.gradle 文件路径
- `--force` - 强制覆盖已有配置

## 使用

```
/init-dt
/init-dt pom.xml
/init-dt --force
```

## 执行步骤

### 1. 检测测试框架

从 `pom.xml` 或 `build.gradle` 提取：
- JUnit 版本
- Mockito 版本
- 其他测试依赖

### 2. 提取 Maven 配置

**优先从 `.idea/workspace.xml` 提取**：

查找 Maven 运行配置，提取：
- settings.xml 路径
- profiles
- JVM 参数
- 自定义参数

**如果没有 `.idea/workspace.xml`**，使用默认配置。

### 3. 安装 DTAgent 组件

安装到 `.opencode/` 目录。

### 4. 生成 DT_AGENTS.md

生成简洁的项目配置文件，包含可直接使用的命令。

## 输出

```
✅ 初始化完成

项目类型: MAVEN
JUnit: 5.9.3
Mockito: 5.4.0

Maven 配置来源: .idea/workspace.xml

配置文件: DT_AGENTS.md
```

## DT_AGENTS.md 示例

```markdown
# DT Agents 配置

## 测试框架

- JUnit: 5.9.3
- Mockito: 5.4.0

## Maven 命令

# 编译测试代码
mvn test-compile -s D:/settings.xml -Pdev

# 运行单个测试
mvn test -Dtest={ClassName} -s D:/settings.xml -Pdev

# 运行所有测试
mvn test -s D:/settings.xml -Pdev

# 覆盖率报告
mvn jacoco:report -s D:/settings.xml -Pdev

## 测试用例规范

**必须使用 Given-When-Then 模式**：

# Given - 准备测试数据
# When - 执行被测方法
# Then - 验证结果

## 命名规范

- 测试类: {ClassName}Test
- 测试方法: 方法名_场景_预期结果
- 使用 @DisplayName 提供中文描述
```

## 注意

- Maven 配置优先从 IDE 配置提取
- 生成的命令可直接复制使用
- 经验存放在 `.opencode/skills/generate-java-ut/experiences/`