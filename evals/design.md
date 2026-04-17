# DTAgent Skill 自动化测评系统设计

## 1. 系统架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Evaluation Runner                             │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │ Test Loader  │──▶│  Executor    │──▶│  Analyzer    │            │
│  │  (YAML)      │   │  (OpenCode)  │   │ (Metrics)    │            │
│  └──────────────┘   └──────────────┘   └──────────────┘            │
│         │                  │                  │                    │
│         ▼                  ▼                  ▼                    │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │ Test Suite   │   │ Skill Runner │   │ Comparator   │            │
│  │   Library    │   │   (Real)     │   │ (Baseline)   │            │
│  └──────────────┘   └──────────────┘   └──────────────┘            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Report Generator                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │   Score      │   │   Trend      │   │    CI/CD     │            │
│  │ Calculator   │   │  Analysis    │   │  Integration │            │
│  └──────────────┘   └──────────────┘   └──────────────┘            │
│                                                                      │
│  Output: HTML Report / Markdown / JSON / Dashboard                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件说明

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **Test Loader** | 加载测试用例 | YAML 文件 | TestCase[] |
| **Skill Executor** | 执行 Skill 命令 | TestCase + 环境 | Execution Result |
| **Metrics Analyzer** | 分析执行结果 | Execution Log | Metrics Object |
| **Comparator** | 对比基准 | Current + Baseline | Delta Report |
| **Report Generator** | 生成报告 | All Data | HTML/Markdown |

---

## 2. 测评维度与指标体系

### 2.1 通用维度（所有 Skill）

| 维度 | 指标 | 权重 | 测量方法 | 目标值 |
|------|------|------|----------|--------|
| **Success Rate** | 成功率 | 30% | 成功次数/总次数 | >95% |
| **Execution Time** | 执行耗时 | 15% | 平均执行时间 | <60s |
| **Stability** | 稳定性 | 15% | 多次运行方差 | <5% |
| **Resource Usage** | 资源消耗 | 10% | Token/内存/CPU | 基准值 |
| **Error Recovery** | 错误恢复 | 15% | 自动修复次数 | >80% |
| **Output Quality** | 输出质量 | 15% | 人工评分 1-5 | >4.0 |

### 2.2 Skill 专属维度

#### 2.2.1 init-dt Skill

| 指标 | 权重 | 测量方法 | 通过标准 |
|------|------|----------|----------|
| Project Type Detection | 20% | 检测 Maven/Gradle | 100%准确 |
| Version Parsing | 15% | 解析 pom.xml 变量 | 解析率>90% |
| File Generation | 20% | 生成 DT_AGENTS.md | 完整性100% |
| Config Correctness | 20% | JSON/XML 有效性 | 100%有效 |
| Component Installation | 15% | .opencode/ 检查 | 全部存在 |
| Init Time | 10% | 总耗时 | <30s |

#### 2.2.2 generate-java-ut Skill

| 指标 | 权重 | 测量方法 | 通过标准 |
|------|------|----------|----------|
| **Compilation Rate** | 25% | mvn test-compile | 100%通过 |
| **Test Pass Rate** | 25% | mvn test | 100%通过 |
| **Code Coverage** | 20% | JaCoCo 报告 | >80% |
| **Mock Precision** | 10% | 静态分析 | verify正确率>90% |
| **Naming Convention** | 10% | DisplayName 检查 | 100%符合 |
| **Exception Coverage** | 10% | assertThrows 统计 | >50%方法 |

#### 2.2.3 fix-java-ut Skill

| 指标 | 权重 | 测量方法 | 通过标准 |
|------|------|----------|----------|
| **Compile Fix Rate** | 35% | 修复编译错误 | 成功率>95% |
| **Test Fix Rate** | 35% | 修复测试失败 | 成功率>80% |
| **Fix Iterations** | 15% | 平均修复轮次 | <3轮 |
| **Fix Quality** | 15% | 修复后测试稳定性 | >95% |

#### 2.2.4 java-coverage Skill

| 指标 | 权重 | 测量方法 | 通过标准 |
|------|------|----------|----------|
| **Coverage Accuracy** | 35% | 对比 JaCoCo | 误差<5% |
| **Blind Spot Detection** | 30% | 识别未测试代码 | 召回率>90% |
| **Analysis Time** | 20% | 执行耗时 | <120s |
| **Report Quality** | 15% | 可读性评分 | >4.0 |

#### 2.2.5 cwd-ut-protection Skill

| 指标 | 权重 | 测量方法 | 通过标准 |
|------|------|----------|----------|
| **Problem Location** | 30% | 定位目标代码 | 准确率>95% |
| **Fix Accuracy** | 30% | 代码修复正确性 | >90% |
| **Dimension Coverage** | 25% | testDimensions 覆盖 | 100% |
| **Test Pass Rate** | 15% | 运行验证 | 100% |

---

## 3. 评分算法

### 3.1 综合评分公式

```javascript
// 单项 Skill 评分
function calculateSkillScore(metrics) {
  let weightedScore = 0;
  let totalWeight = 0;
  
  for (const [metric, config] of Object.entries(metrics)) {
    const normalizedValue = normalize(config.value, config.target);
    weightedScore += normalizedValue * config.weight;
    totalWeight += config.weight;
  }
  
  return (weightedScore / totalWeight) * 100;
}

// 归一化（0-1）
function normalize(value, target) {
  if (value >= target) return 1.0;
  return Math.max(0, value / target);
}

// 总体评分
function calculateOverallScore(skillScores) {
  const weights = {
    'init-dt': 0.15,
    'generate-java-ut': 0.35,
    'fix-java-ut': 0.25,
    'java-coverage': 0.15,
    'cwd-ut-protection': 0.10
  };
  
  let totalScore = 0;
  for (const [skill, score] of Object.entries(skillScores)) {
    totalScore += score * weights[skill];
  }
  
  return totalScore;
}
```

### 3.2 评级标准

| 分数范围 | 评级 | 说明 |
|----------|------|------|
| 95-100 | ⭐⭐⭐⭐⭐ A+ | 卓越，接近完美 |
| 90-94 | ⭐⭐⭐⭐⭐ A | 优秀，符合生产标准 |
| 85-89 | ⭐⭐⭐⭐☆ B+ | 良好，小问题待改进 |
| 80-84 | ⭐⭐⭐⭐ B | 合格，需要优化 |
| 70-79 | ⭐⭐⭐☆ C | 及格，明显问题 |
| <70 | ⭐⭐⭐ D | 不合格，需重大改进 |

---

## 4. 测试用例设计规范

### 4.1 用例格式（YAML）

```yaml
# evals/test-cases/generate-java-ut/case-01-simple-service.yaml
id: gen-ut-001
name: Simple Service Test Generation
skill: generate-java-ut
priority: P0
description: |
  测试为简单 Service 类生成单元测试的能力
  覆盖正常流程、异常处理和边界条件

target:
  type: file
  path: src/main/java/com/example/UserService.java
  
prerequisites:
  - type: init-dt
    args: []
  - type: maven-validate
    args: []

expected:
  # 文件检查
  files:
    - path: src/test/java/com/example/UserServiceTest.java
      exists: true
      minLines: 100
      maxLines: 500
  
  # 编译检查
  compilation:
    shouldCompile: true
    maxWarnings: 0
    maxErrors: 0
  
  # 运行检查
  execution:
    shouldPass: true
    minTests: 5
    passRate: 1.0
  
  # 覆盖率检查
  coverage:
    minLineCoverage: 0.80
    minBranchCoverage: 0.70
  
  # 代码规范检查
  codeQuality:
    namingConvention: true
    givenWhenThen: true
    mockUsage: true

timeout: 180000  # 3分钟
retries: 3       # 失败重试次数
```

### 4.2 用例分类

| 类别 | 说明 | 示例 |
|------|------|------|
| **Smoke** | 基础功能验证 | 简单 POJO 测试生成 |
| **Core** | 核心功能 | 复杂 Service 类生成 |
| **Edge** | 边界情况 | 空类、无方法类 |
| **Error** | 错误处理 | 无效输入处理 |
| **Integration** | 集成测试 | 端到端流程 |
| **Performance** | 性能测试 | 大规模类生成 |

### 4.3 用例优先级

| 优先级 | 说明 | 数量目标 |
|--------|------|----------|
| P0 (Critical) | 核心功能，必须100%通过 | 10-15个 |
| P1 (High) | 重要功能，通过率>95% | 20-30个 |
| P2 (Medium) | 一般功能，通过率>90% | 30-50个 |
| P3 (Low) | 边缘场景，通过率>80% | 50+个 |

---

## 5. 对比评估机制

### 5.1 对比维度

```
┌─────────────────────────────────────────────────────────────┐
│                    Comparison Matrix                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Current vs Baseline (Regression)                            │
│  ├── 版本对比 (v1.0 vs v1.1)                                │
│  └── 配置对比 (不同参数设置)                                │
│                                                              │
│  DTAgent vs Golden Standard (Quality)                       │
│  ├── 专家编写测试                                           │
│  └── 行业最佳实践                                           │
│                                                              │
│  DTAgent vs Alternatives (Competitive)                      │
│  ├── GitHub Copilot                                         │
│  ├── JetBrains AI                                           │
│  └── Aider                                                  │
│                                                              │
│  Skill vs Skill (Internal)                                  │
│  └── 组合效果评估                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Delta 计算

```javascript
// 计算改进/退化
calculateDelta(current, baseline) {
  const delta = current - baseline;
  const percentage = (delta / baseline) * 100;
  
  return {
    absolute: delta,
    percentage: percentage,
    trend: delta > 0 ? 'improved' : delta < 0 ? 'regressed' : 'stable',
    significance: Math.abs(percentage) > 5 ? 'significant' : 'minor'
  };
}
```

### 5.3 配对评估流程

```yaml
# evals/comparisons/manual-vs-dtagent.yaml
comparison_id: comp-001
name: Manual vs DTAgent Test Quality
baseline:
  type: manual
  author: expert
  description: 由资深开发者手工编写的测试代码
treatment:
  type: dtagent
  skill: generate-java-ut
  version: 1.0.0

target: src/main/java/com/example/OrderService.java

metrics_to_compare:
  - lines_of_code
  - test_count
  - assertion_count
  - coverage_line
  - coverage_branch
  - mock_count
  - execution_time
  - readability_score

significance_threshold: 5%  # 差异超过5%视为显著
```

---

## 6. 报告设计

### 6.1 报告类型

| 类型 | 触发条件 | 内容 | 格式 |
|------|----------|------|------|
| **Quick Report** | 单次执行 | 核心指标 | Console |
| **Full Report** | 完整测评 | 所有指标+详情 | HTML |
| **CI Report** | CI/CD 集成 | 通过/失败状态 | JSON |
| **Trend Report** | 定期执行 | 历史趋势 | Dashboard |
| **Comparison Report** | 对比执行 | 差异分析 | PDF |

### 6.2 报告结构

```markdown
# DTAgent Skill Evaluation Report
Generated: 2025-04-17 14:30:00
Version: 1.0.0

## Executive Summary
- Overall Score: 87/100 (B+)
- Status: PASSED
- Duration: 15m 30s
- Test Cases: 25/25 passed

## Skill Scores
| Skill | Score | Rating | Trend |
|-------|-------|--------|-------|
| init-dt | 86 | ⭐⭐⭐⭐☆ | ↑ +2% |
| generate-java-ut | 90 | ⭐⭐⭐⭐⭐ | → 0% |
| fix-java-ut | 88 | ⭐⭐⭐⭐☆ | ↓ -1% |

## Detailed Results
...

## Issues Found
1. [MEDIUM] Coverage analysis timeout
2. [LOW] ByteBuddy warning

## Recommendations
1. Increase timeout for coverage analysis
2. Add JVM flag to suppress warning

## Appendix
- Full logs
- Raw data
- Configuration
```

---

## 7. CI/CD 集成

### 7.1 GitHub Actions 示例

```yaml
# .github/workflows/evaluate-skills.yml
name: Evaluate DTAgent Skills

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # 每天凌晨2点

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Environment
        uses: actions/setup-java@v3
        with:
          java-version: '11'
          
      - name: Install OpenCode
        run: npm install -g opencode-ai
        
      - name: Install DTAgent
        run: npm link
        
      - name: Run Evaluation
        run: npm run eval:all
        
      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: evaluation-report
          path: evals/reports/
          
      - name: Check Threshold
        run: |
          score=$(cat evals/reports/summary.json | jq '.overallScore')
          if [ $score -lt 80 ]; then
            echo "Score $score below threshold 80"
            exit 1
          fi
```

### 7.2 质量门禁

```javascript
// 质量检查规则
const qualityGates = {
  critical: {
    'init-dt.successRate': { min: 1.0 },
    'generate-java-ut.compileRate': { min: 1.0 },
    'generate-java-ut.testPassRate': { min: 0.95 }
  },
  warning: {
    'overall.score': { min: 80 },
    'generate-java-ut.coverage': { min: 0.75 }
  }
};
```

---

## 8. 实施路线图

### Phase 1: 基础框架 (Week 1-2)
- [ ] 创建核心 Runner
- [ ] 实现 Test Loader
- [ ] 基础 Metrics 收集
- [ ] Console 报告输出

### Phase 2: 测试用例 (Week 3-4)
- [ ] P0 测试用例 (15个)
- [ ] P1 测试用例 (25个)
- [ ] 黄金标准基准

### Phase 3: 分析对比 (Week 5-6)
- [ ] Metrics Analyzer
- [ ] Baseline Comparator
- [ ] Delta 计算

### Phase 4: 可视化 (Week 7-8)
- [ ] HTML Report
- [ ] Dashboard
- [ ] Trend Chart

### Phase 5: 集成 (Week 9-10)
- [ ] CI/CD 集成
- [ ] 质量门禁
- [ ] 自动化触发

---

## 9. 目录结构

```
evals/
├── README.md                      # 系统说明
├── design.md                      # 本设计文档
├── package.json                   # 依赖配置
├── src/
│   ├── core/
│   │   ├── Runner.js             # 核心运行器
│   │   ├── TestLoader.js         # 测试加载器
│   │   ├── SkillExecutor.js      # Skill 执行器
│   │   ├── MetricsAnalyzer.js    # 指标分析器
│   │   └── ReportGenerator.js    # 报告生成器
│   ├── skills/
│   │   ├── InitDtEvaluator.js
│   │   ├── GenerateJavaUtEvaluator.js
│   │   ├── FixJavaUtEvaluator.js
│   │   ├── JavaCoverageEvaluator.js
│   │   └── CwdUtProtectionEvaluator.js
│   └── utils/
│       ├── MavenRunner.js
│       ├── GitHelper.js
│       └── ScoreCalculator.js
├── test-cases/
│   ├── init-dt/
│   ├── generate-java-ut/
│   ├── fix-java-ut/
│   ├── java-coverage/
│   └── cwd-ut-protection/
├── fixtures/
│   └── expected-results/
├── comparisons/
│   └── baseline-definitions/
└── reports/
    ├── templates/
    └── output/
```

---

## 10. 使用示例

### 10.1 命令行使用

```bash
# 运行所有测试
npm run eval:all

# 运行单个 Skill
npm run eval:skill --skill=generate-java-ut

# 运行单个测试用例
npm run eval:case --case=gen-ut-001

# 对比模式
npm run eval:compare --baseline=manual --current=dtagent

# 生成报告
npm run eval:report --format=html

# CI 模式（简洁输出）
npm run eval:ci
```

### 10.2 配置示例

```json
// evals/config.json
{
  "parallelism": 4,
  "timeout": {
    "default": 180000,
    "init-dt": 60000,
    "generate-java-ut": 300000
  },
  "retries": 3,
  "thresholds": {
    "overall": 80,
    "init-dt": 85,
    "generate-java-ut": 90
  },
  "output": {
    "formats": ["html", "json", "markdown"],
    "directory": "./reports"
  },
  "comparison": {
    "enabled": true,
    "baselinePath": "./fixtures/expected-results"
  }
}
```

---

**文档版本**: v1.0  
**最后更新**: 2025-04-17  
**作者**: Sisyphus
