# DTAgent Skill 测评系统迁移指南

## 概述

本指南帮助你将测评系统迁移到公司的 DTAgentCLI 项目中。

## 快速迁移步骤

### 1. 复制文件

将以下文件复制到公司项目：

```bash
# 核心文件
cp -r evals/ /path/to/company-dtagentcli/

# 或者选择性复制
mkdir -p /path/to/company-dtagentcli/evals
cp evals/package.json /path/to/company-dtagentcli/evals/
cp -r evals/src/ /path/to/company-dtagentcli/evals/
cp -r evals/test-cases/ /path/to/company-dtagentcli/evals/
```

### 2. 安装依赖

```bash
cd /path/to/company-dtagentcli/evals
npm install
```

### 3. 配置适配

根据公司环境修改 `config.json`：

```json
{
  "parallelism": 4,
  "timeout": {
    "default": 180000,
    "init-dt": 60000,
    "generate-java-ut": 300000,
    "fix-java-ut": 300000,
    "java-coverage": 300000,
    "cwd-ut-protection": 300000
  },
  "thresholds": {
    "overall": 80,
    "init-dt": 85,
    "generate-java-ut": 90,
    "fix-java-ut": 85,
    "java-coverage": 80,
    "cwd-ut-protection": 75
  },
  "output": {
    "directory": "./evals/reports",
    "formats": ["html", "json", "markdown"]
  }
}
```

### 4. 适配公司技能

如果公司有自定义 skill，需要：

1. **创建 Evaluator**

```javascript
// evals/src/skills/YourCustomSkillEvaluator.js
const { BaseEvaluator } = require('./BaseEvaluator');

class YourCustomSkillEvaluator extends BaseEvaluator {
  async evaluate(testCase) {
    // 实现评估逻辑
    const result = await this.executeSkill(testCase);
    return this.validate(result, testCase.expected);
  }
}

module.exports = { YourCustomSkillEvaluator };
```

2. **注册到 Runner**

```javascript
// 在 Runner.js 中添加
const evaluators = {
  'init-dt': InitDtEvaluator,
  'generate-java-ut': GenerateJavaUtEvaluator,
  'your-custom-skill': YourCustomSkillEvaluator
};
```

### 5. 创建测试用例

根据公司实际场景创建测试用例：

```yaml
# evals/test-cases/your-skill/case-001.yaml
id: TC-CUSTOM-001
name: 公司特定场景测试
skill: your-custom-skill
priority: P0

target:
  type: file
  path: src/main/java/com/company/Service.java

expected:
  compilation:
    shouldCompile: true
  execution:
    shouldPass: true

timeout: 120000
```

### 6. 集成 CI/CD

#### GitLab CI

```yaml
# .gitlab-ci.yml
evaluate:
  stage: test
  script:
    - cd evals && npm install
    - npm run eval:ci
  artifacts:
    reports:
      junit: evals/reports/junit.xml
    paths:
      - evals/reports/
```

#### Jenkins

```groovy
// Jenkinsfile
pipeline {
    stages {
        stage('Evaluate') {
            steps {
                sh 'cd evals && npm install'
                sh 'cd evals && npm run eval:ci'
            }
        }
    }
    post {
        always {
            publishHTML([
                allowMissing: false,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'evals/reports',
                reportFiles: 'report.html',
                reportName: 'DTAgent Evaluation Report'
            ])
        }
    }
}
```

## 自定义配置

### 修改评分权重

```javascript
// evals/src/core/MetricsAnalyzer.js
const weights = {
  'your-custom-skill': 0.20,
  'init-dt': 0.15,
  'generate-java-ut': 0.35
};
```

### 添加新指标

```javascript
// 在 MetricsAnalyzer.js 中
async collectCustomMetrics(result, workDir) {
  return {
    customMetric: await this.measureCustom(workDir),
    anotherMetric: result.someValue
  };
}
```

### 自定义报告模板

```javascript
// evals/src/core/ReportGenerator.js
buildCustomHTML(data) {
  return `
    <div class="custom-section">
      <h2>公司定制报告</h2>
      <!-- 自定义内容 -->
    </div>
  `;
}
```

## 常见问题

### Q: 如何适配不同的测试框架？

A: 修改 `SkillExecutor.js` 中的命令构建逻辑：

```javascript
buildCommand(skillName, testCase) {
  switch (skillName) {
    case 'your-framework':
      return {
        cmd: 'your-test-runner',
        args: ['--config', 'your-config.xml']
      };
  }
}
```

### Q: 如何处理公司特定的依赖？

A: 在 `prepareEnvironment` 中添加：

```javascript
async prepareCompanyDeps(workDir) {
  // 复制公司私有依赖
  await fs.copy(
    '/company/nexus/repository',
    path.join(workDir, '.m2/repository')
  );
}
```

### Q: 如何集成公司监控系统？

A: 在 `ReportGenerator.js` 中添加：

```javascript
async sendToMonitoring(data) {
  await fetch('https://company.monitoring/api/metrics', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer TOKEN' },
    body: JSON.stringify(data)
  });
}
```

## 最佳实践

1. **从简单开始**：先迁移基础功能，再逐步添加自定义
2. **保持同步**：定期从上游同步更新
3. **文档化**：记录公司特定的修改
4. **自动化**：集成到 CI/CD 流程
5. **监控趋势**：长期追踪指标变化

## 技术支持

如有问题，请联系：
- 内部 Wiki：xxx
- Slack 频道：#dtagent-dev
- 邮件：dtagent@company.com
