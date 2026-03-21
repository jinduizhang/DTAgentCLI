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

### 步骤 1：运行覆盖率分析

```bash
mvn jacoco:report
```

或手动分析源码和测试码。

### 步骤 2：收集覆盖率数据

解析 JaCoCo 报告或静态分析：

1. 读取 `src/main/java` 下的源文件
2. 读取 `src/test/java` 下的测试文件
3. 建立源文件与测试文件的对应关系

### 步骤 3：分析覆盖情况

对每个类分析：

1. **方法覆盖**：哪些 public 方法有对应测试
2. **分支覆盖**：if/else 是否都测试
3. **边界覆盖**：边界值是否测试
4. **异常覆盖**：异常路径是否测试

### 步骤 4：识别测试盲区

列出：
- 无测试的类
- 测试不充分的方法
- 缺失的测试场景

### 步骤 5：生成建议

为每个盲区提供具体的测试建议。

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

1. 使用 `/generate-single` 为无测试的类生成测试
2. 使用 `/generate-dir` 批量补充测试
3. 手动补充特定测试场景