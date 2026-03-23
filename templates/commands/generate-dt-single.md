---
description: 端到端单文件测试生成 - 生成→修复→覆盖率提升
---

# 端到端单文件测试生成

为指定 Java 源文件执行完整测试生成流程。

## 参数

- `{file}` - 源文件路径（必需）

## 使用

```
/generate-dt-single src/main/java/com/example/service/OrderService.java
```

## 执行流程

### 1. generate-java-ut

加载 `generate-java-ut` 技能生成单元测试。

**二方件处理**：

```
1. 分析被测类依赖
2. 识别二方件（com.alibaba.*, com.taobao.* 等）
3. 查找 .dtagent/deps/index.json
4. 读取反编译文件，提取方法签名
5. 生成精准 Mock
```

### 2. fix-java-ut

加载 `fix-java-ut` 技能修复失败的测试。

### 3. java-coverage

加载 `java-coverage` 技能分析并提升覆盖率。

## 二方件识别规则

| 包名前缀 | 类型 | 处理 |
|---------|------|------|
| java.*, javax.* | 标准库 | 直接使用 |
| org.springframework.* | 框架 | 有文档 |
| org.apache.*, com.google.* | 开源库 | 有文档 |
| com.alibaba.*, com.taobao.* | 二方件 | 使用反编译 |

## 输出

```
🎉 端到端测试生成完成

源文件: OrderService.java
测试文件: OrderServiceTest.java

阶段:
✅ 测试生成
✅ 测试修复
✅ 覆盖率提升

测试用例: 8 个
覆盖率: 82%

二方件 Mock:
- DiamondClient (com.alibaba.diamond)
- ConfigClient (com.taobao.config)
```