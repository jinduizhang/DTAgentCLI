---
name: generate-java-ut
description: 分析Java源代码并生成JUnit 5单元测试
compatibility: opencode
metadata:
  language: java
  framework: junit5
---

## 功能

为 Java 类生成单元测试。

## 执行步骤

### 1. 加载项目经验

扫描 `experiences/` 目录，读取经验文件。

### 2. 分析目标类

分析源代码结构，识别 public 方法和依赖。

### 3. 匹配经验

根据 import、注解、类名匹配经验。

### 4. 生成测试

创建测试类，生成测试用例，应用匹配到的经验。