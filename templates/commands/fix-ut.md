---
description: 修复失败的测试 - 调用 fix-java-ut 技能自动修复
---

# 修复失败的测试

调用 `fix-java-ut` 技能分析测试失败原因并自动修复。

## 参数

- `{test}` - 测试类或测试方法（必需）

## 使用

```
/fix-ut OrderServiceTest
/fix-ut OrderServiceTest#testCreateOrder
```

## 执行

加载 `fix-java-ut` 技能执行修复。

## 输出

```
🔧 测试修复完成

测试: OrderServiceTest#testCreateOrder
问题: Mock 未正确设置
修复: 添加 when() 返回值
验证: ✅ 通过
```