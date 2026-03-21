# 项目级覆盖率 UT 补齐

分析项目整体测试覆盖率，优先为高价值代码补充测试。

## 参数

- `--threshold N` - 目标覆盖率（可选，默认 80%）
- `--priority CLASS|METHOD|BRANCH` - 优先级策略（可选，默认 METHOD）
- `--limit N` - 最多补充测试数量（可选，默认无限制）

## 使用示例

```
/coverage-fill
/coverage-fill --threshold 85
/coverage-fill --priority BRANCH --limit 20
```

## 执行步骤

### 步骤 1：运行覆盖率分析

```bash
mvn clean test jacoco:report
```

解析 `target/site/jacoco/jacoco.xml`。

### 步骤 2：识别低覆盖区域

按优先级排序：

**优先级策略**：
- `CLASS` - 按类覆盖率排序，优先处理无测试的类
- `METHOD` - 按方法覆盖率排序，优先处理未覆盖的方法
- `BRANCH` - 按分支覆盖率排序，优先处理未覆盖的分支

### 步骤 3：价值评估

对每个未覆盖代码评估价值：

| 价值 | 条件 | 优先级 |
|------|------|--------|
| 高 | 核心 Service、包含业务逻辑 | ⭐⭐⭐ |
| 中 | Controller、工具类 | ⭐⭐ |
| 低 | DTO、Entity、配置类 | ⭐ |

### 步骤 4：生成补充测试计划

```
📊 覆盖率补齐计划

当前覆盖率: 45%
目标覆盖率: 80%
需提升: 35%

高价值测试（优先级 ⭐⭐⭐）:
1. OrderService - 6 个方法未测试
2. PaymentService - 4 个方法未测试
3. UserService - 3 个方法未测试

中价值测试（优先级 ⭐⭐）:
4. OrderController - 3 个方法未测试
5. UserController - 2 个方法未测试

预计新增测试: 18 个
预计覆盖率提升: +30%
```

### 步骤 5：批量生成测试

按优先级依次生成：

1. 先处理高价值（⭐⭐⭐）
2. 检查覆盖率是否达标
3. 如未达标，继续处理中价值（⭐⭐）
4. 重复直到达标或达到 limit

### 步骤 6：验证覆盖率

重新运行覆盖率报告，验证提升效果。

## 输出格式

```
📊 项目级覆盖率 UT 补齐

初始覆盖率: 45%
目标覆盖率: 80%

执行计划:
[1/6] OrderServiceTest.java ✅
[2/6] PaymentServiceTest.java ✅
[3/6] UserServiceTest.java ✅
[4/6] OrderControllerTest.java ✅
[5/6] UserControllerTest.java ✅
[6/6] ConfigServiceTest.java ✅

最终覆盖率: 82% ✅

覆盖率提升: +37%
新增测试: 24 个
新增测试文件: 6 个

详细报告: .dtagent/reports/coverage-fill-report.md
```

## 智能跳过规则

自动跳过以下代码：

1. **生成的代码**
   - Lombok 生成的方法
   - IDE 生成的 getter/setter

2. **简单委托**
   - 仅调用其他方法，无业务逻辑

3. **配置类**
   - 纯配置类，无业务逻辑

4. **DTO/Entity**
   - 纯数据类，getter/setter

## 后续建议

1. 测试生成后，建议人工审查关键业务逻辑
2. 对于复杂逻辑，补充更多边界测试
3. 定期运行覆盖率报告，监控覆盖率变化