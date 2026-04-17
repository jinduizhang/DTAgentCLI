# generate-java-ut Skill Test Cases

## P0 - Critical (核心功能)

### TC-GEN-001: Simple POJO Test Generation
```yaml
id: TC-GEN-001
name: 简单 POJO 类测试生成
priority: P0
description: 测试为简单 POJO 类生成 getter/setter 测试的能力

target:
  type: file
  path: src/main/java/com/example/model/User.java

prerequisites:
  - type: init-dt
    args: []

expected:
  files:
    - path: src/test/java/com/example/model/UserTest.java
      exists: true
      minLines: 50
      mustContain:
        - "@Test"
        - "@DisplayName"
        - "getName"
        - "setName"
  
  compilation:
    shouldCompile: true
    maxErrors: 0
  
  execution:
    shouldPass: true
    minTests: 3
  
  coverage:
    minLineCoverage: 0.90

timeout: 60000
```

### TC-GEN-002: Service with Dependencies
```yaml
id: TC-GEN-002
name: 带依赖的 Service 类测试生成
priority: P0
description: 测试为带有 Repository 依赖的 Service 类生成测试

target:
  type: file
  path: src/main/java/com/example/service/UserService.java

expected:
  files:
    - path: src/test/java/com/example/service/UserServiceTest.java
      exists: true
      minLines: 150
      mustContain:
        - "@Mock"
        - "@InjectMocks"
        - "@ExtendWith(MockitoExtension.class)"
        - "when(...).thenReturn"
        - "verify("
  
  compilation:
    shouldCompile: true
  
  execution:
    shouldPass: true
    minTests: 5
    passRate: 1.0
  
  coverage:
    minLineCoverage: 0.80
    minBranchCoverage: 0.70

timeout: 120000
```

### TC-GEN-003: Exception Handling
```yaml
id: TC-GEN-003
name: 异常处理测试生成
priority: P0
description: 测试生成异常场景的测试用例（空指针、参数校验等）

target:
  type: file
  path: src/main/java/com/example/service/OrderService.java

expected:
  codeQuality:
    exceptionTests:
      minCount: 3
      types:
        - IllegalArgumentException
        - IllegalStateException
        - NullPointerException
    
    assertions:
      mustContain:
        - "assertThrows"
        - "assertThatThrownBy"

timeout: 90000
```

### TC-GEN-004: Multiple Methods Coverage
```yaml
id: TC-GEN-004
name: 多方法覆盖测试生成
priority: P0
description: 测试为包含多个 public 方法的类生成完整测试

target:
  type: file
  path: src/main/java/com/example/service/ProductService.java

prerequisites:
  - type: file-exists
    check: src/main/java/com/example/service/ProductService.java

expected:
  execution:
    minTests: 10
  
  coverage:
    minLineCoverage: 0.75
    minMethodCoverage: 0.90

timeout: 180000
```

---

## P1 - High (重要功能)

### TC-GEN-101: Interface Implementation
```yaml
id: TC-GEN-101
name: 接口实现类测试生成
priority: P1
description: 测试为实现了接口的类生成测试

target:
  type: file
  path: src/main/java/com/example/service/impl/UserServiceImpl.java

expected:
  files:
    - path: src/test/java/com/example/service/impl/UserServiceImplTest.java
      exists: true

timeout: 120000
```

### TC-GEN-102: Abstract Class
```yaml
id: TC-GEN-102
name: 抽象类测试生成
priority: P1
description: 测试为抽象类及其子类生成测试

target:
  type: file
  path: src/main/java/com/example/BaseService.java

expected:
  compilation:
    shouldCompile: true
  
  codeQuality:
    abstractClassHandled: true

timeout: 90000
```

### TC-GEN-103: Generic Types
```yaml
id: TC-GEN-103
name: 泛型类测试生成
priority: P1
description: 测试为使用泛型的类生成测试

target:
  type: file
  path: src/main/java/com/example/util/GenericMapper.java

expected:
  compilation:
    shouldCompile: true
  
  codeQuality:
    genericTypesHandled: true

timeout: 120000
```

### TC-GEN-104: Static Methods
```yaml
id: TC-GEN-104
name: 静态方法测试生成
priority: P1
description: 测试为包含静态方法的类生成测试

target:
  type: file
  path: src/main/java/com/example/util/StringUtils.java

expected:
  execution:
    minTests: 5
  
  codeQuality:
    staticMethodsTested: true

timeout: 90000
```

### TC-GEN-105: Lombok Classes
```yaml
id: TC-GEN-105
name: Lombok 类测试生成
priority: P1
description: 测试为使用 Lombok 注解的类生成测试

target:
  type: file
  path: src/main/java/com/example/dto/UserDTO.java

prerequisites:
  - type: pom-dependency
    artifact: org.projectlombok:lombok

expected:
  compilation:
    shouldCompile: true
  
  codeQuality:
    lombokAware: true

timeout: 90000
```

---

## P2 - Medium (一般功能)

### TC-GEN-201: Builder Pattern
```yaml
id: TC-GEN-201
name: Builder 模式测试生成
priority: P2
description: 测试为使用 Builder 模式的类生成测试

target:
  type: file
  path: src/main/java/com/example/builder/OrderBuilder.java

expected:
  compilation:
    shouldCompile: true

timeout: 90000
```

### TC-GEN-202: Enum with Methods
```yaml
id: TC-GEN-202
name: 带方法的枚举测试生成
priority: P2
description: 测试为包含方法的枚举类生成测试

target:
  type: file
  path: src/main/java/com/example/enums/Status.java

expected:
  execution:
    minTests: 3

timeout: 60000
```

### TC-GEN-203: Stream Operations
```yaml
id: TC-GEN-203
name: Stream 操作测试生成
priority: P2
description: 测试为使用 Java Stream API 的方法生成测试

target:
  type: file
  path: src/main/java/com/example/service/StreamService.java

expected:
  compilation:
    shouldCompile: true
  
  coverage:
    minLineCoverage: 0.70

timeout: 120000
```

### TC-GEN-204: Async Methods
```yaml
id: TC-GEN-204
name: 异步方法测试生成
priority: P2
description: 测试为使用 CompletableFuture 的方法生成测试

target:
  type: file
  path: src/main/java/com/example/service/AsyncService.java

expected:
  compilation:
    shouldCompile: true
  
  codeQuality:
    asyncHandled: true

timeout: 120000
```

---

## P3 - Low (边缘场景)

### TC-GEN-301: Empty Class
```yaml
id: TC-GEN-301
name: 空类测试生成
priority: P3
description: 测试为无方法的空类生成测试（应优雅处理）

target:
  type: file
  path: src/main/java/com/example/EmptyClass.java

expected:
  behavior:
    shouldHandleGracefully: true
    shouldNotCrash: true

timeout: 30000
```

### TC-GEN-302: Private Only
```yaml
id: TC-GEN-302
name: 全私有方法类
priority: P3
description: 测试为只有私有方法的类生成测试

target:
  type: file
  path: src/main/java/com/example/PrivateOnly.java

expected:
  behavior:
    shouldHandleGracefully: true
    outputMessage: "No public methods found"

timeout: 30000
```

### TC-GEN-303: Complex Dependencies
```yaml
id: TC-GEN-303
name: 复杂依赖链
priority: P3
description: 测试为多层依赖的类生成测试

target:
  type: file
  path: src/main/java/com/example/service/ComplexService.java

expected:
  compilation:
    shouldCompile: true

timeout: 180000
```

---

## 测试项目模板

### Template: Basic Maven Project
```yaml
# evals/test-cases/templates/basic-maven.yaml
template_id: basic-maven
description: 基础 Maven 项目模板

structure:
  - pom.xml
  - src/main/java/com/example/
    - model/
    - service/
    - repository/
    - util/
  - src/test/java/com/example/

dependencies:
  - junit-jupiter: 5.9.3
  - mockito-core: 5.4.0
  - assertj-core: 3.24.2
  - lombok: 1.18.28 (optional)

build:
  javaVersion: "11"
  testFramework: junit5
```

### Template: Spring Boot Project
```yaml
# evals/test-cases/templates/spring-boot.yaml
template_id: spring-boot
description: Spring Boot 项目模板

structure:
  - pom.xml
  - src/main/java/com/example/
    - controller/
    - service/
    - repository/
    - config/
  - src/test/java/com/example/

dependencies:
  - spring-boot-starter: 3.x
  - spring-boot-starter-test
  - junit-jupiter
  - mockito

features:
  - spring-test
  - mock-mvc
  - test-slices
```

---

## 用例统计

| 优先级 | 数量 | 目标通过率 | 平均执行时间 |
|--------|------|------------|--------------|
| P0 | 4 | 100% | 112.5s |
| P1 | 5 | 95% | 102s |
| P2 | 4 | 90% | 112.5s |
| P3 | 3 | 80% | 80s |
| **总计** | **16** | **93%** | **107s** |
