---
name: init-dt
description: 初始化项目DT测试框架配置，检测测试框架并生成DT_AGENTS.md
compatibility: opencode
metadata:
  language: java
  type: project-initialization
---

## 功能

初始化 Java 项目的 DT 配置，生成 `DT_AGENTS.md` 项目测试架构文档。

## 执行步骤

### 1. 检测构建系统

- Maven: 检查 `pom.xml`
- Gradle: 检查 `build.gradle`

### 2. 分析依赖

提取测试相关依赖版本：
- JUnit / TestNG
- Mockito / EasyMock
- AssertJ / Hamcrest

### 3. 收集项目经验

扫描 `src/test/java/**/*.java`，识别 Mock 模式。

### 4. 生成 DT_AGENTS.md

输出到项目根目录，包含框架版本和项目经验。