---
description: 初始化项目 DT 配置 - 检测框架版本，安装组件，收集项目经验
---

# 初始化项目 DT 配置

初始化 Java 项目的测试框架配置。

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

### 1. 检测项目框架

分析构建文件，提取测试框架版本：
- JUnit 版本
- Mockito 版本
- 其他测试依赖

### 2. 安装 DTAgent 组件

安装到 `.opencode/` 目录：
- skills/ - 技能定义
- commands/ - 斜杠命令
- plugins/ - 任务管理插件

### 3. 收集项目经验

扫描 `src/test/java/**/*.java`，识别 Mock 模式：
- `@Mock` 注解使用
- `when().thenReturn()` 调用
- 依赖注入方式

### 4. 生成 DT_AGENTS.md

生成项目配置文件，包含框架版本和项目经验。

## 输出

```
✅ 初始化完成

项目类型: MAVEN
JUnit: 5.9.3
Mockito: 5.4.0

组件位置: .opencode/
配置文件: DT_AGENTS.md
```

## 注意

- 经验存放在 `.opencode/skills/generate-java-ut/experiences/`
- 使用 `dtagent extract-experience --dir src/test/java --save` 提取更多经验