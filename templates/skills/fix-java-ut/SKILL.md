---
name: fix-java-ut
description: 分析测试失败原因并修复JUnit测试代码
compatibility: opencode
metadata:
  language: java
  framework: junit5
---

## 功能

分析单元测试失败原因并修复。

## 执行步骤

### 1. 读取项目配置

先读取 `DT_AGENTS.md` 或 `opencode.json` 获取：
- Maven settings 路径
- 自定义 JVM 参数
- Profile 配置

### 2. 诊断失败原因

运行测试并分析失败原因：
- 编译错误：语法错误、类型不匹配、缺少导入
- Mock 问题：未正确设置 Mock、verify 次数不匹配
- 断言失败：期望值与实际值不符
- NullPointerException：未正确初始化对象

根据项目配置选择合适的测试命令：
```bash
# 基础命令
mvn test -Dtest={ClassName}Test

# 带自定义 settings
mvn test -Dtest={ClassName}Test -s /path/to/settings.xml

# 带 profile
mvn test -Dtest={ClassName}Test -Pdev
```

### 3. 修复问题

根据诊断结果修复：
- 缺少导入 → 添加 `import static org.mockito.Mockito.*`
- Mock 未设置 → 添加 `when(mock.method()).thenReturn(value)`
- 验证次数错误 → 调整 `verify(mock, times(n))`
- 断言失败 → 检查业务逻辑，调整期望值

### 4. 验证修复

使用相同命令验证修复结果。

## 常见修复模式

| 问题 | 修复方案 |
|------|----------|
| NullPointerException | 添加 Mock 或 @InjectMocks |
| when() 未定义 | 添加 `import static org.mockito.Mockito.*` |
| verify 次数不匹配 | 调整 `times(n)` 值 |
| 断言失败 | 检查业务逻辑，调整期望值 |

## 注意事项

1. 保持最小化修改，只修复问题本身
2. 根据项目配置选择正确的测试命令
3. 内网项目可能需要自定义 settings.xml