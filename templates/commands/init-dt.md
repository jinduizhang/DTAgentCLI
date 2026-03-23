---
description: 初始化项目 DT 配置 - 检测框架，提取 Maven 配置，生成 DT_AGENTS.md
---

# 初始化项目 DT 配置

初始化 Java 项目的测试框架配置，生成 `DT_AGENTS.md`。

## 参数

- `{file}` - 可选，指定 pom.xml 或 build.gradle 文件路径
- `--force` - 强制覆盖已有配置
- `--decompile <packages>` - 反编译二方件，多个包用逗号分隔（如 `com.huawei.*`）
- `--m2Repo <path>` - Maven 本地仓库路径（如 `D:/00_code/repository`）

## 使用

```
# 基础初始化
/init-dt

# 指定配置文件
/init-dt pom.xml

# 强制覆盖
/init-dt --force

# 反编译二方件（推荐）
/init-dt --decompile com.huawei.*

# 指定 Maven 仓库路径
/init-dt --m2Repo D:/repository

# 完整命令
/init-dt --decompile com.huawei.* --m2Repo D:/repository
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

### 3. 反编译二方件（可选）

**使用 CFR 反编译工具**（内置在 bin/cfr-0.152.jar）

**执行流程**：
1. 扫描本地 Maven 仓库（~/.m2/repository）
2. 匹配 `--decompile` 指定的包范围
3. 反编译匹配的 jar 文件
4. 存储到 `.dtagent/deps/`
5. 生成索引文件 `.dtagent/deps/index.json`

**存储结构**：
```
.dtagent/
├── deps/
│   ├── index.json
│   ├── com/
│   │   └── alibaba/
│   │       └── diamond/
│   │           └── DiamondClient.java
│   └── taobao/
│       └── config/
│           └── ConfigClient.java
```

**二方件 Mock 示例**（反编译后生成）：
```java
// com.alibaba.diamond.DiamondClient
@Mock
private DiamondClient diamondClient;

// Mock 示例:
when(diamondClient.getConfig(arg0, arg1)).thenReturn(null);
when(diamondClient.publish(arg0, arg1, arg2)).thenReturn(null);
```

### 4. 安装 DTAgent 组件

安装到 `.opencode/` 目录。

### 5. 生成 DT_AGENTS.md

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

## 二方件信息

反编译范围: com.alibaba.*, com.taobao.*
反编译类数: 15
存储位置: .dtagent/deps/
索引文件: .dtagent/deps/index.json

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

**必须使用 Given-When-Then 模式**。

## 命名规范

- 测试类: {ClassName}Test
- 测试方法: 方法名_场景_预期结果
- 使用 @DisplayName 提供中文描述
```

## 注意

- Maven 配置优先从 IDE 配置提取
- 生成的命令可直接复制使用
- 经验存放在 `.opencode/skills/generate-java-ut/experiences/`