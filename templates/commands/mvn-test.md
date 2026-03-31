---
description: 执行 Maven 测试 - 自动读取 IDEA 配置，使用项目指定 JDK 和 Maven 设置运行测试
---

# Maven Test 命令

自动读取 IntelliJ IDEA 项目配置，使用项目指定的 JDK、Maven 版本和设置运行测试。

## 参数

- `{testClass}` - 可选，指定测试类名（如 `HistoryAspectTest`）
- `--all` - 运行所有测试（不指定测试类时默认行为）
- `--dry-run` - 只显示命令，不实际执行

## 使用

```
# 运行 workspace.xml 中选中的测试类
/mvn-test

# 运行指定测试类
/mvn-test HistoryAspectTest

# 运行所有测试
/mvn-test --all

# 只显示命令，不执行
/mvn-test --dry-run
```

## 读取的配置

**从 `.idea/misc.xml` 读取：**
- 项目 JDK 名称（如 `21`）
- 语言级别（如 `JDK_25`）

**从 `.idea/workspace.xml` 读取：**
- Maven Home 路径
- 本地仓库路径
- settings.xml 路径
- 当前选中的测试类

**从 IDEA 系统配置读取：**
- JDK 实际安装路径（`jdk.table.xml`）

## 执行的命令

自动组装并执行：

```bash
cd "项目目录" && \
export JAVA_HOME="JDK路径" && \
export MAVEN_OPTS="-Dmaven.repo.local=本地仓库路径" && \
"Maven/bin/mvn" -s "settings.xml路径" -Dtest=测试类 test
```

## 实际示例

```bash
$ /mvn-test HistoryAspectTest

[INFO] 读取 IDEA 配置...
[INFO] JDK: 21 (Amazon Corretto 21.0.10)
[INFO] Maven: 3.9.13
[INFO] 本地仓库: D:\00_code\repository
[INFO] 测试类: HistoryAspectTest

========== 生成的命令 ==========
cd "D:/OpenCode/config-history" && \
set JAVA_HOME=C:/Program Files/Amazon Corretto/jdk21.0.10_7 && \
set MAVEN_OPTS=-Dmaven.repo.local="D:\00_code\repository" && \
"D:\apache-maven-3.9.13\bin\mvn.cmd" -s "D:\apache-maven-3.9.13\conf\settings.xml" \
-Dtest=HistoryAspectTest test
================================

[INFO] 执行测试...

[INFO] -------------------------------------------------------
[INFO]  T E S T S
[INFO] -------------------------------------------------------
[INFO] Running com.example.config.history.aspect.HistoryAspectTest
[INFO] Tests run: 31, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

## 输出

```
✅ 测试执行完成

项目: config-history
JDK: 21 (Amazon Corretto)
Maven: 3.9.13
测试类: HistoryAspectTest
结果: 31 passed, 0 failed
时间: 4.5s
```

## 多项目 JDK 支持

如果你有多个项目使用不同 JDK：

```bash
# 项目 A - JDK 8
cd /path/to/project-a
/mvn-test

# 项目 B - JDK 21  
cd /path/to/project-b
/mvn-test
```

命令会自动读取各自项目的 IDEA 配置，使用对应 JDK 运行。

## 注意事项

- 必须在包含 `.idea` 目录的项目根目录执行
- 需要 IDEA 曾经打开过该项目（生成 .idea 配置）
- Windows 使用 `set`，Unix 使用 `export` 设置环境变量
- 如果找不到 IDEA 配置，会回退到系统默认 JAVA_HOME

## 与 init-dt 的关系

1. **init-dt** - 初始化项目，提取配置，生成 DT_AGENTS.md
2. **mvn-test** - 使用提取的配置执行测试

先执行 `/init-dt` 初始化，然后随时使用 `/mvn-test` 运行测试。
