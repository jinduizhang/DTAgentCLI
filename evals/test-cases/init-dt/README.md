# init-dt Skill Test Cases

## P0 - Critical

### TC-INIT-001: Maven Project Detection
```yaml
id: TC-INIT-001
name: Maven 项目检测
priority: P0
description: 测试正确识别 Maven 项目并提取配置

target:
  type: project
  structure:
    - pom.xml
    - src/main/java/
    - src/test/java/

pom_content: |
  <?xml version="1.0" encoding="UTF-8"?>
  <project>
    <groupId>com.example</groupId>
    <artifactId>test-project</artifactId>
    <version>1.0.0</version>
    <properties>
      <junit.jupiter.version>5.9.3</junit.jupiter.version>
      <mockito.version>5.4.0</mockito.version>
    </properties>
  </project>

expected:
  detection:
    projectType: MAVEN
    confidence: 1.0
  
  files:
    - path: DT_AGENTS.md
      exists: true
      mustContain:
        - "MAVEN"
        - "test-compile"
        - "Given-When-Then"
    
    - path: opencode.json
      exists: true
      jsonValid: true
      mustContain:
        - '"default_agent": "dtagent"'
    
    - path: .opencode/skills/generate-java-ut/SKILL.md
      exists: true
  
  execution:
    shouldComplete: true
    maxTime: 30000

timeout: 60000
```

### TC-INIT-002: Gradle Project Detection
```yaml
id: TC-INIT-002
name: Gradle 项目检测
priority: P0
description: 测试正确识别 Gradle 项目

target:
  type: project
  structure:
    - build.gradle
    - src/main/java/

expected:
  detection:
    projectType: GRADLE
    confidence: 1.0
  
  files:
    - path: DT_AGENTS.md
      exists: true
      mustContain:
        - "GRADLE"
        - "gradle test"

timeout: 60000
```

### TC-INIT-003: Multi-Module Maven
```yaml
id: TC-INIT-003
name: 多模块 Maven 项目
priority: P0
description: 测试处理多模块 Maven 项目

target:
  type: project
  structure:
    - pom.xml (parent)
    - module-a/pom.xml
    - module-b/pom.xml

expected:
  detection:
    projectType: MAVEN
    isMultiModule: true
  
  files:
    - path: DT_AGENTS.md
      exists: true
      mustContain:
        - "multi-module"
        - "-pl {module}"

timeout: 60000
```

### TC-INIT-004: Version Parsing
```yaml
id: TC-INIT-004
name: 版本号解析
priority: P0
description: 测试正确解析 pom.xml 中的版本变量

target:
  type: project
  pom_content: |
    <properties>
      <junit.jupiter.version>5.9.3</junit.jupiter.version>
      <mockito.version>5.4.0</mockito.version>
      <assertj.version>3.24.2</assertj.version>
    </properties>
    <dependencies>
      <dependency>
        <groupId>org.junit.jupiter</groupId>
        <artifactId>junit-jupiter</artifactId>
        <version>${junit.jupiter.version}</version>
      </dependency>
    </dependencies>

expected:
  files:
    - path: DT_AGENTS.md
      mustContain:
        - "JUnit: 5.9.3"
        - "Mockito: 5.4.0"
      shouldNotContain:
        - "${junit.jupiter.version}"
        - "${mockito.version}"

timeout: 60000
retries: 0  # 已知问题，暂不修复
knownIssue: |
  当前版本无法解析 ${xxx} 变量，显示为原始字符串
  期望: JUnit: 5.9.3
  实际: JUnit: ${junit.jupiter.version}
severity: medium
```

---

## P1 - High

### TC-INIT-101: Custom Maven Settings
```yaml
id: TC-INIT-101
name: 自定义 Maven 配置
priority: P1
description: 测试从 .idea/workspace.xml 提取自定义 Maven 配置

target:
  type: project
  structure:
    - pom.xml
    - .idea/workspace.xml

idea_config: |
  <component name="ProjectRunConfigurationManager">
    <configuration type="MavenRunConfiguration">
      <MavenSettings>
        <option name="myUserSettingsFile" value="D:/settings.xml" />
        <option name="myProfiles" value="dev,test" />
        <option name="myVmOptions" value="-Xmx2g" />
      </MavenSettings>
    </configuration>
  </component>

expected:
  files:
    - path: DT_AGENTS.md
      mustContain:
        - "settings: D:/settings.xml"
        - "profiles: dev,test"
        - "-Xmx2g"

timeout: 60000
```

### TC-INIT-102: Empty Project
```yaml
id: TC-INIT-102
name: 空项目处理
priority: P1
description: 测试对无效项目的处理

target:
  type: project
  structure:
    - README.md

expected:
  behavior:
    shouldFailGracefully: true
    errorMessage: "未检测到 Maven 或 Gradle 项目"
    exitCode: 1

timeout: 30000
```

### TC-INIT-103: Already Initialized
```yaml
id: TC-INIT-103
name: 重复初始化
priority: P1
description: 测试对已初始化项目的处理

target:
  type: project
  preInit: true
  structure:
    - pom.xml
    - DT_AGENTS.md (existing)
    - .opencode/ (existing)

expected:
  behavior:
    shouldWarn: true
    shouldNotOverwrite: true
    message: "项目已初始化"

timeout: 60000
```

---

## P2 - Medium

### TC-INIT-201: Force Reinitialize
```yaml
id: TC-INIT-201
name: 强制重新初始化
priority: P2
description: 测试 --force 参数覆盖现有配置

target:
  type: project
  preInit: true
  args:
    - --force

expected:
  behavior:
    shouldOverwrite: true
    shouldComplete: true
  
  files:
    - path: DT_AGENTS.md
      exists: true
      shouldBeNewer: true

timeout: 60000
```

### TC-INIT-202: With Decompile
```yaml
id: TC-INIT-202
name: 带反编译初始化
priority: P2
description: 测试 --decompile 参数反编译二方件

target:
  type: project
  args:
    - --decompile
    - com.alibaba.*
    - --m2-repo
    - D:/repository

expected:
  files:
    - path: .dtagent/deps/index.json
      exists: true
    - path: .dtagent/deps/
      minSubdirs: 1
  
  behavior:
    decompileSuccess: true

timeout: 300000
```

---

## P3 - Low

### TC-INIT-301: Very Long Paths
```yaml
id: TC-INIT-301
name: 超长路径处理
priority: P3
description: 测试超长项目路径的处理

target:
  type: project
  path: D:/very/long/path/to/the/project/directory/that/might/cause/issues

expected:
  behavior:
    shouldComplete: true

timeout: 60000
```

### TC-INIT-302: Special Characters
```yaml
id: TC-INIT-302
name: 特殊字符处理
priority: P3
description: 测试项目路径包含特殊字符

target:
  type: project
  path: D:/projects/test-project_v1.0-beta

expected:
  behavior:
    shouldComplete: true

timeout: 60000
```

---

## 用例统计

| 优先级 | 数量 | 目标通过率 | 备注 |
|--------|------|------------|------|
| P0 | 4 | 100% | 核心功能 |
| P1 | 3 | 95% | 重要功能 |
| P2 | 2 | 90% | 一般功能 |
| P3 | 2 | 80% | 边缘场景 |
| **总计** | **11** | **93%** | - |

---

## Known Issues

| ID | 问题描述 | 严重程度 | 状态 |
|----|----------|----------|------|
| KI-001 | 版本变量解析失败 ${xxx} | medium | open |
| KI-002 | 多模块项目子模块配置不完整 | low | open |
| KI-003 | IDEA 配置解析有时失败 | low | open |
