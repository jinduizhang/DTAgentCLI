# fix-java-ut Skill Test Cases

## P0 - Critical

### TC-FIX-001: Missing Import
```yaml
id: TC-FIX-001
name: 缺少 Import 修复
priority: P0
description: 测试修复缺少 import 语句的测试文件

target:
  type: file
  path: src/test/java/com/example/service/UserServiceTest.java
  injectError:
    type: remove-import
    imports:
      - org.mockito.Mock
      - org.mockito.InjectMocks

expected:
  behavior:
    shouldDetect: true
    shouldFix: true
    fixAttempts: 1
  
  compilation:
    shouldCompile: true
    initialErrors: ">0"
    finalErrors: 0
  
  execution:
    shouldPass: true
    passRate: 1.0

timeout: 120000
```

### TC-FIX-002: Wrong Mock Setup
```yaml
id: TC-FIX-002
name: 错误 Mock 设置修复
priority: P0
description: 测试修复错误的 Mock 配置

target:
  type: file
  path: src/test/java/com/example/service/OrderServiceTest.java
  injectError:
    type: wrong-mock
    changes:
      - replace: "when(repo.findById(1L)).thenReturn(order)"
        with: "when(repo.findById(any())).thenReturn(null)"

expected:
  behavior:
    shouldDetect: true
    shouldFix: true
  
  execution:
    shouldPass: true
  
  codeQuality:
    mockPrecision: "improved"

timeout: 180000
```

### TC-FIX-003: Type Mismatch
```yaml
id: TC-FIX-003
name: 类型不匹配修复
priority: P0
description: 测试修复类型不匹配的测试代码

target:
  type: file
  injectError:
    type: type-mismatch
    changes:
      - replace: "String result"
        with: "Integer result"

expected:
  behavior:
    shouldDetect: true
    shouldFix: true
  
  compilation:
    shouldCompile: true

timeout: 120000
```

### TC-FIX-004: Assertion Error
```yaml
id: TC-FIX-004
name: 断言错误修复
priority: P0
description: 测试修复失败的断言

target:
  type: file
  injectError:
    type: wrong-assertion
    changes:
      - replace: "assertThat(result).isEqualTo(\"expected\")"
        with: "assertThat(result).isEqualTo(\"wrong\")"

expected:
  behavior:
    shouldDetect: true
    shouldFix: true
  
  execution:
    shouldPass: true

timeout: 180000
```

---

## P1 - High

### TC-FIX-101: Multiple Compile Errors
```yaml
id: TC-FIX-101
name: 多编译错误修复
priority: P1
description: 测试修复多个编译错误

target:
  type: file
  injectError:
    type: multiple
    count: 5
    types:
      - missing-import
      - wrong-type
      - undefined-variable
      - wrong-method-call
      - syntax-error

expected:
  behavior:
    shouldFixAll: true
    maxIterations: 10
  
  compilation:
    shouldCompile: true
    finalErrors: 0

timeout: 300000
```

### TC-FIX-102: Runtime Exception
```yaml
id: TC-FIX-102
name: 运行时异常修复
priority: P1
description: 测试修复运行时异常（NullPointerException等）

target:
  type: file
  injectError:
    type: runtime-exception
    exception: NullPointerException
    cause: "missing-when-then"

expected:
  behavior:
    shouldDetect: true
    shouldFix: true
  
  execution:
    shouldPass: true

timeout: 180000
```

### TC-FIX-103: Batch Fix Directory
```yaml
id: TC-FIX-103
name: 批量目录修复
priority: P1
description: 测试批量修复目录下的多个测试文件

target:
  type: directory
  path: src/test/java/com/example/service/
  injectErrors:
    - file: UserServiceTest.java
      type: missing-import
    - file: OrderServiceTest.java
      type: wrong-mock
    - file: ProductServiceTest.java
      type: assertion-error

expected:
  behavior:
    totalFiles: 3
    fixedFiles: 3
    compileSuccessRate: 1.0
  
  execution:
    shouldPass: true
    passRate: 1.0

timeout: 300000
```

---

## P2 - Medium

### TC-FIX-201: Timeout Recovery
```yaml
id: TC-FIX-201
name: 超时测试修复
priority: P2
description: 测试修复因超时失败的测试

target:
  type: file
  injectError:
    type: infinite-loop
    location: "@Test method"

expected:
  behavior:
    shouldDetect: true
    shouldAttemptFix: true
  
  execution:
    shouldComplete: true
    maxTime: 60000

timeout: 300000
```

### TC-FIX-202: Resource Cleanup
```yaml
id: TC-FIX-202
name: 资源清理修复
priority: P2
description: 测试修复资源未清理的测试

target:
  type: file
  injectError:
    type: resource-leak
    resource: "MockedStatic"

expected:
  behavior:
    shouldFix: true
  
  codeQuality:
    hasCleanup: true

timeout: 180000
```

---

## P3 - Low

### TC-FIX-301: Unfixable Error
```yaml
id: TC-FIX-301
name: 不可修复错误
priority: P3
description: 测试对无法自动修复错误的处理

target:
  type: file
  injectError:
    type: architectural
    description: "需要重构被测代码才能修复"

expected:
  behavior:
    shouldAttempt: true
    shouldReachLimit: true
    maxAttempts: 10
    finalCompile: true  # 至少保证编译通过
  
  execution:
    mayFail: true

timeout: 300000
```

### TC-FIX-302: Fix Regression
```yaml
id: TC-FIX-302
name: 修复回归测试
priority: P3
description: 测试修复引入的新问题

target:
  type: file
  injectError:
    type: cascading
    first: missing-import
    second: "修复引入的错误类型"

expected:
  behavior:
    shouldRecover: true
    shouldNotCreateNewIssues: true

timeout: 300000
```

---

## 用例统计

| 优先级 | 数量 | 目标通过率 | 平均修复时间 |
|--------|------|------------|--------------|
| P0 | 4 | 100% | <3轮 |
| P1 | 3 | 95% | <5轮 |
| P2 | 2 | 90% | <5轮 |
| P3 | 2 | 80% | N/A |
| **总计** | **11** | **93%** | **<4轮** |

---

## 修复能力矩阵

| 错误类型 | 自动修复 | 部分修复 | 需人工 |
|----------|----------|----------|--------|
| 缺少 Import | ✅ | - | - |
| 类型不匹配 | ✅ | - | - |
| Mock 错误 | ✅ | - | - |
| 断言错误 | ✅ | - | - |
| 语法错误 | ✅ | - | - |
| 无限循环 | ⚠️ | ✅ | - |
| 架构问题 | - | ⚠️ | ✅ |
| 并发问题 | - | - | ✅ |

✅ = 完全自动修复  
⚠️ = 部分修复  
- = 不支持
