# 分析测试覆盖率

分析项目的测试覆盖情况，识别测试盲区。

## 参数

- `{target}` - 目标类或包（可选，默认整个项目）
- `--threshold N` - 覆盖率阈值（可选，默认 80）

## 使用示例

```
/coverage
/coverage com.example.service
/coverage OrderService
/coverage --threshold 70
```

## 执行步骤

### 步骤 1：读取 Maven 配置

**必须从 `DT_AGENTS.md` 读取覆盖率命令，禁止硬编码**：

```
if (DT_AGENTS.md 不存在) {
  执行 /init-dt
}

从 DT_AGENTS.md 读取覆盖率命令
```

**禁止事项**：
- ❌ 不准使用默认的 `mvn jacoco:report`
- ✅ 必须使用 DT_AGENTS.md 中的命令

### 步骤 2：调用 java-coverage 技能

加载 `java-coverage` 技能执行覆盖率分析。

### 步骤 3：识别测试盲区

列出：
- 无测试的类
- 测试不充分的方法
- 缺失的测试场景

## 输出格式

```
📊 测试覆盖率分析

总体覆盖率: 72%

按模块统计:
- controller: 45% ⚠️
- service: 85% ✅
- repository: 92% ✅
- util: 60% ⚠️

测试盲区:
❌ OrderController
   - createOrder(): 无测试
   - updateOrder(): 无测试
   - deleteOrder(): 无测试

⚠️ UserService
   - updateUser(): 缺少异常测试
   - deleteUser(): 缺少边界测试

建议补充测试:
1. OrderController.createOrder() - 正常创建场景
2. OrderController.createOrder() - 参数校验失败场景
3. UserService.updateUser() - 用户不存在异常
4. UserService.deleteUser() - 删除不存在用户
```

## 后续操作

根据分析结果，可以：

1. 使用 `/generate-dt-single` 为无测试的类生成测试
2. 使用 `/generate-dt-dir` 批量补充测试
3. 手动补充特定测试场景