const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

/**
 * 报告生成器
 * 生成 HTML/Markdown/JSON 格式的测评报告
 */
class ReportGenerator {
  constructor(config) {
    this.config = config;
    this.outputDir = config.output?.directory || './reports';
  }

  /**
   * 生成报告
   */
  async generate(data) {
    const { metrics, comparison, timestamp, duration } = data;
    
    const formats = this.config.output?.formats || ['html', 'json'];
    
    const reportData = {
      metadata: {
        version: '1.0.0',
        timestamp,
        duration,
        config: this.config
      },
      metrics,
      comparison,
      summary: this.generateSummary(metrics)
    };

    const generated = [];

    for (const format of formats) {
      switch (format) {
        case 'html':
          await this.generateHTML(reportData);
          generated.push('html');
          break;
          
        case 'markdown':
          await this.generateMarkdown(reportData);
          generated.push('md');
          break;
          
        case 'json':
          await this.generateJSON(reportData);
          generated.push('json');
          break;
          
        case 'csv':
          await this.generateCSV(reportData);
          generated.push('csv');
          break;
      }
    }

    // 输出报告路径
    console.log(chalk.green('\n📄 Reports generated:'));
    for (const ext of generated) {
      const filePath = path.join(this.outputDir, `report.${ext}`);
      console.log(`   ${chalk.gray(filePath)}`);
    }

    return {
      success: true,
      formats: generated,
      outputDir: this.outputDir
    };
  }

  /**
   * 生成摘要
   */
  generateSummary(metrics) {
    const { summary, skillScores, overallScore } = metrics;
    
    return {
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      passRate: (summary.passRate * 100).toFixed(1),
      overallScore,
      rating: this.getRating(overallScore),
      skillBreakdown: Object.entries(skillScores).map(([skill, score]) => ({
        skill,
        score,
        rating: this.getRating(score)
      }))
    };
  }

  /**
   * 获取评级
   */
  getRating(score) {
    if (score >= 95) return { grade: 'A+', stars: '⭐⭐⭐⭐⭐', level: '卓越' };
    if (score >= 90) return { grade: 'A', stars: '⭐⭐⭐⭐⭐', level: '优秀' };
    if (score >= 85) return { grade: 'B+', stars: '⭐⭐⭐⭐☆', level: '良好' };
    if (score >= 80) return { grade: 'B', stars: '⭐⭐⭐⭐', level: '合格' };
    if (score >= 70) return { grade: 'C', stars: '⭐⭐⭐☆', level: '及格' };
    return { grade: 'D', stars: '⭐⭐⭐', level: '不合格' };
  }

  /**
   * 生成 HTML 报告
   */
  async generateHTML(data) {
    const html = this.buildHTML(data);
    const filePath = path.join(this.outputDir, 'report.html');
    
    await fs.ensureDir(this.outputDir);
    await fs.writeFile(filePath, html);
    
    return filePath;
  }

  /**
   * 构建 HTML
   */
  buildHTML(data) {
    const { metadata, metrics, comparison, summary } = data;
    const rating = summary.rating;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DTAgent Skill Evaluation Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      border-radius: 10px;
      margin-bottom: 30px;
    }
    .header h1 { font-size: 2.5em; margin-bottom: 10px; }
    .header .meta { opacity: 0.9; font-size: 0.9em; }
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: white;
      padding: 25px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .card h3 { 
      font-size: 0.9em; 
      color: #666; 
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .card .value { 
      font-size: 2.5em; 
      font-weight: bold;
      color: #667eea;
    }
    .card.passed .value { color: #28a745; }
    .card.failed .value { color: #dc3545; }
    .card.score .value { 
      background: linear-gradient(135deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .skill-table {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }
    .skill-table table {
      width: 100%;
      border-collapse: collapse;
    }
    .skill-table th {
      background: #f8f9fa;
      padding: 15px;
      text-align: left;
      font-weight: 600;
      color: #495057;
    }
    .skill-table td {
      padding: 15px;
      border-top: 1px solid #e9ecef;
    }
    .skill-table tr:hover { background: #f8f9fa; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 500;
    }
    .badge-excellent { background: #d4edda; color: #155724; }
    .badge-good { background: #cce5ff; color: #004085; }
    .badge-pass { background: #fff3cd; color: #856404; }
    .badge-fail { background: #f8d7da; color: #721c24; }
    .progress-bar {
      height: 8px;
      background: #e9ecef;
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-bar .fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      transition: width 0.3s ease;
    }
    .comparison-section {
      background: white;
      padding: 25px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .trend { 
      font-size: 0.9em; 
      margin-left: 10px;
    }
    .trend.up { color: #28a745; }
    .trend.down { color: #dc3545; }
    .footer {
      text-align: center;
      padding: 30px;
      color: #666;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>DTAgent Skill Evaluation</h1>
      <div class="meta">
        Generated: ${new Date(metadata.timestamp).toLocaleString()} | 
        Duration: ${(metadata.duration / 1000).toFixed(1)}s | 
        Version: ${metadata.version}
      </div>
    </div>

    <div class="summary-cards">
      <div class="card score">
        <h3>Overall Score</h3>
        <div class="value">${summary.overallScore}</div>
        <div>${rating.stars} ${rating.grade}</div>
      </div>
      <div class="card passed">
        <h3>Passed</h3>
        <div class="value">${summary.passed}</div>
        <div>${summary.passRate}% pass rate</div>
      </div>
      <div class="card failed">
        <h3>Failed</h3>
        <div class="value">${summary.failed}</div>
        <div>out of ${summary.total} tests</div>
      </div>
    </div>

    <div class="skill-table">
      <table>
        <thead>
          <tr>
            <th>Skill</th>
            <th>Score</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Pass Rate</th>
            <th>Avg Duration</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          ${summary.skillBreakdown.map(skill => `
            <tr>
              <td><strong>${skill.skill}</strong></td>
              <td>
                <div class="progress-bar" style="width: 100px; display: inline-block;">
                  <div class="fill" style="width: ${skill.score}%"></div>
                </div>
                ${skill.score}
              </td>
              <td>${metrics.bySkill[skill.skill]?.passed || 0}</td>
              <td>${metrics.bySkill[skill.skill]?.failed || 0}</td>
              <td>${((metrics.bySkill[skill.skill]?.passRate || 0) * 100).toFixed(1)}%</td>
              <td>${((metrics.bySkill[skill.skill]?.avgDuration || 0) / 1000).toFixed(1)}s</td>
              <td><span class="badge badge-${skill.score >= 90 ? 'excellent' : skill.score >= 80 ? 'good' : 'pass'}">${skill.rating.grade}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${comparison ? `
    <div class="comparison-section">
      <h2>Comparison with Baseline</h2>
      ${Object.entries(comparison).map(([skill, data]) => `
        <div style="margin-bottom: 15px;">
          <strong>${skill}</strong>
          <span class="trend ${data.delta >= 0 ? 'up' : 'down'}">
            ${data.delta >= 0 ? '▲' : '▼'} ${Math.abs(data.delta).toFixed(1)}%
          </span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="footer">
      <p>Generated by DTAgent Evaluator v${metadata.version}</p>
      <p>For issues or questions, please contact the development team</p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * 生成 Markdown 报告
   */
  async generateMarkdown(data) {
    const { metadata, metrics, comparison, summary } = data;
    const rating = summary.rating;

    const md = `# DTAgent Skill Evaluation Report

**Generated**: ${new Date(metadata.timestamp).toLocaleString()}  
**Duration**: ${(metadata.duration / 1000).toFixed(1)}s  
**Version**: ${metadata.version}

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Score** | ${summary.overallScore} ${rating.stars} (${rating.grade}) |
| **Total Tests** | ${summary.total} |
| **Passed** | ${summary.passed} (${summary.passRate}%) |
| **Failed** | ${summary.failed} |

---

## Skill Breakdown

| Skill | Score | Passed | Failed | Pass Rate | Avg Duration | Rating |
|-------|-------|--------|--------|-----------|--------------|--------|
${summary.skillBreakdown.map(skill => `| ${skill.skill} | ${skill.score} | ${metrics.bySkill[skill.skill]?.passed || 0} | ${metrics.bySkill[skill.skill]?.failed || 0} | ${((metrics.bySkill[skill.skill]?.passRate || 0) * 100).toFixed(1)}% | ${((metrics.bySkill[skill.skill]?.avgDuration || 0) / 1000).toFixed(1)}s | ${skill.rating.grade} |`).join('\n')}

---

## Detailed Metrics

### By Priority

${Object.entries(metrics.bySkill).map(([skill, data]) => `
#### ${skill}

| Priority | Total | Passed | Pass Rate |
|----------|-------|--------|-----------|
${Object.entries(data.byPriority || {}).map(([priority, stats]) => `| ${priority} | ${stats.total} | ${stats.passed} | ${(stats.passed / stats.total * 100).toFixed(1)}% |`).join('\n')}
`).join('\n')}

---

${comparison ? `
## Comparison with Baseline

| Skill | Current | Baseline | Delta | Trend |
|-------|---------|----------|-------|-------|
${Object.entries(comparison).map(([skill, data]) => `| ${skill} | ${data.current} | ${data.baseline} | ${data.delta >= 0 ? '+' : ''}${data.delta.toFixed(1)}% | ${data.delta >= 0 ? '↑' : '↓'} |`).join('\n')}
` : ''}

---

## Failed Tests

${metrics.details.filter(d => !d.success).map(d => `
### ${d.id}

- **Skill**: ${d.skill}
- **Error**: ${d.error || 'Unknown'}
- **Duration**: ${((d.duration || 0) / 1000).toFixed(1)}s
`).join('\n') || 'No failed tests! ✅'}

---

*Report generated by DTAgent Evaluator v${metadata.version}*
`;

    const filePath = path.join(this.outputDir, 'report.md');
    await fs.writeFile(filePath, md);
    
    return filePath;
  }

  /**
   * 生成 JSON 报告
   */
  async generateJSON(data) {
    const filePath = path.join(this.outputDir, 'report.json');
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return filePath;
  }

  /**
   * 生成 CSV 报告
   */
  async generateCSV(data) {
    const { metrics } = data;
    
    const headers = ['ID', 'Skill', 'Success', 'Duration', 'Error'];
    const rows = metrics.details.map(d => [
      d.id,
      d.skill,
      d.success,
      d.duration,
      d.error || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const filePath = path.join(this.outputDir, 'report.csv');
    await fs.writeFile(filePath, csv);
    
    return filePath;
  }
}

module.exports = { ReportGenerator };
