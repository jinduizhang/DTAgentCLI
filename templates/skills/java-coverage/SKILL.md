---
name: java-coverage
description: 分析Java代码的测试覆盖情况，识别未测试代码
compatibility: opencode
metadata:
  language: java
  type: coverage-analysis
---

## 功能说明

分析Java项目的测试覆盖情况，识别哪些代码没有被测试覆盖。

## 使用时机

当需要了解测试覆盖率、找出测试盲区时使用。

## 执行步骤

### 步骤1：收集信息

- 读取目标Java文件
- 查找对应的测试文件
- 分析代码结构（方法、分支、异常处理）

### 步骤2：覆盖率分析

- 识别已测试的方法
- 识别未测试的方法
- 识别已测试但分支覆盖不全的方法
- 识别未测试的异常处理路径

### 步骤3：生成报告

- 列出所有方法的覆盖状态
- 标识高风险未覆盖区域
- 建议需要补充的测试用例

## 分析维度

1. **方法覆盖**：哪些public方法有对应的测试
2. **分支覆盖**：if/else、switch等分支是否都测试
3. **边界覆盖**：边界值是否测试
4. **异常覆盖**：异常处理路径是否测试

## 输出格式

```
覆盖率分析报告
================

目标类: com.example.Service
测试类: com.example.ServiceTest

方法覆盖:
✅ processOrder() - 已测试
❌ cancelOrder() - 未测试
⚠️ validateOrder() - 部分测试（缺少异常路径）

建议补充测试:
1. cancelOrder() - 正常取消场景
2. cancelOrder() - 订单不存在场景  
3. validateOrder() - 无效订单异常
```