---
name: cwd-ut-protection
description: 基于CWD编号的自动化UT防护，用户输入方法地址和CWD编号，系统自动修复代码并生成全方位测试防护
compatibility: opencode
metadata:
  language: java
  framework: junit5
---

## 功能

为 Java 代码提供基于 CWD 编号的 UT 防护能力。

用户输入方法地址和 CWD 编号，系统自动：
1. 查找问题库获取 CWD 问题定义
2. 定位问题代码
3. 自动修复代码
4. 基于 CWD 测试防护维度生成全方位测试
5. 运行测试验证修复

## 执行步骤

### 1. 读取项目配置
从 DT_AGENTS.md 读取 Maven 命令。

### 2. 解析用户输入
输入格式：方法地址 + CWD 编号

### 3. 查找问题库
读取 .opencode/problems.json 获取 CWD 定义。

### 4. 定位问题代码
搜索并定位目标方法中的问题代码。

### 5. AI 自动修复
基于 CWD 定义自动修复代码。

### 6. AI 生成测试
基于测试防护维度生成全方位测试。

### 7. 运行测试验证
运行 mvn test 验证修复。

## 测试防护维度

### CWD-1001 的测试防护维度

1. **拷贝方向正确性** - 确保属性从源正确拷贝到目标
2. **空对象处理** - 测试源/目标为空时的行为
3. **部分属性拷贝** - 测试部分属性拷贝场景
4. **类型不匹配处理** - 测试类型不匹配时的行为
5. **异常处理** - 测试拷贝过程中的异常

## 使用示例

输入:
方法地址: com.example.config.util.UserConverter#convertToVO
CWD 编号: CWD-1001
