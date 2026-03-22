---
name: init-dt
description: 初始化项目DT配置，检测测试框架，提取Maven配置，生成DT_AGENTS.md
compatibility: opencode
metadata:
  language: java
  type: project-initialization
---

## 功能

初始化 Java 项目的 DT 配置，生成简洁的 `DT_AGENTS.md` 配置文件。

## 执行步骤

### 1. 检测构建系统

- Maven: 检查 `pom.xml`
- Gradle: 检查 `build.gradle`

### 2. 提取测试框架版本

从 pom.xml/build.gradle 提取：
- JUnit 版本
- Mockito 版本

### 3. 提取 Maven 配置

**优先从 `.idea/workspace.xml` 提取**：

查找 `<configuration>` 中的 Maven 运行配置：
- `mavenSettingsFile` - settings.xml 路径
- `profiles` - 激活的 profiles
- `vmOptions` - JVM 参数
- `userSettingsFile` - 用户 settings

**提取逻辑**：

```xml
<!-- 查找 MavenRunConfiguration -->
<component name="ProjectRunConfigurationManager">
  <configuration name="xxx" type="MavenRunConfiguration">
    <MavenSettings>
      <option name="myUserSettingsFile" value="D:/settings.xml" />
      <option name="myProfiles" value="dev,test" />
      <option name="myVmOptions" value="-Xmx2g" />
    </MavenSettings>
  </configuration>
</component>
```

**如果未找到 IDE 配置**，使用默认值（无自定义参数）。

### 4. 生成 DT_AGENTS.md

生成简洁配置，包含：
- 测试框架版本
- 可直接使用的 Maven 命令（带自定义参数）
- 测试用例规范（Given-When-Then 模式）
- 命名规范

**DT_AGENTS.md 内容**：

```markdown
# DT Agents 配置

## 测试框架
- JUnit: x.x.x
- Mockito: x.x.x

## Maven 命令
mvn test-compile [自定义参数]
mvn test -Dtest={ClassName} [自定义参数]
mvn test [自定义参数]
mvn jacoco:report [自定义参数]

## 测试用例规范
必须使用 Given-When-Then 模式

## 命名规范
- 测试类: {ClassName}Test
- 测试方法: 方法名_场景_预期结果
```

## 输出示例

```
✅ 初始化完成

项目类型: MAVEN
JUnit: 5.9.3
Mockito: 5.4.0

Maven 配置来源: .idea/workspace.xml
- settings: D:/settings.xml
- profiles: dev

配置文件: DT_AGENTS.md
```