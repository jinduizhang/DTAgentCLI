const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');

/**
 * 简化的测评演示脚本
 */
class DemoEvaluator {
  constructor() {
    this.results = [];
  }

  async run() {
    console.log(chalk.blue('🚀 DTAgent Skill Evaluation Demo\n'));
    console.log('─'.repeat(60));

    // 模拟测试用例
    const testCases = [
      {
        id: 'TC-INIT-001',
        name: 'Maven 项目初始化测试',
        skill: 'init-dt',
        priority: 'P0',
        expected: { shouldPass: true }
      },
      {
        id: 'TC-GEN-001',
        name: 'UserService 测试生成',
        skill: 'generate-java-ut',
        priority: 'P0',
        expected: { shouldPass: true }
      },
      {
        id: 'TC-FIX-001',
        name: '编译错误修复',
        skill: 'fix-java-ut',
        priority: 'P1',
        expected: { shouldPass: true }
      },
      {
        id: 'TC-COV-001',
        name: '覆盖率分析',
        skill: 'java-coverage',
        priority: 'P1',
        expected: { shouldPass: false } // 模拟失败
      }
    ];

    // 执行测试
    for (const testCase of testCases) {
      await this.runTest(testCase);
    }

    // 生成报告
    await this.generateReport();
  }

  async runTest(testCase) {
    const spinner = ora(`[${testCase.id}] ${testCase.name}`).start();
    
    // 模拟执行时间
    const duration = Math.floor(Math.random() * 5000) + 2000;
    await this.sleep(duration);

    // 模拟结果（基于 expected）
    const success = testCase.expected.shouldPass && Math.random() > 0.1;
    
    const result = {
      id: testCase.id,
      skill: testCase.skill,
      name: testCase.name,
      priority: testCase.priority,
      success,
      duration,
      timestamp: new Date().toISOString()
    };

    this.results.push(result);

    if (success) {
      spinner.succeed(`${testCase.name} ${chalk.green('✓')} (${duration}ms)`);
    } else {
      spinner.fail(`${testCase.name} ${chalk.red('✗')} (${duration}ms)`);
    }
  }

  async generateReport() {
    console.log('\n' + '─'.repeat(60));
    console.log(chalk.blue('📊 Evaluation Report\n'));

    // 统计
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    const passRate = (passed / total * 100).toFixed(1);
    const avgDuration = Math.floor(
      this.results.reduce((a, b) => a + b.duration, 0) / total
    );

    // 按 Skill 统计
    const bySkill = {};
    for (const r of this.results) {
      if (!bySkill[r.skill]) {
        bySkill[r.skill] = { total: 0, passed: 0 };
      }
      bySkill[r.skill].total++;
      if (r.success) {
        bySkill[r.skill].passed++;
      }
    }

    // 计算分数
    const overallScore = Math.floor((passed / total) * 100);
    const rating = this.getRating(overallScore);

    // 输出摘要
    console.log('Overall Score:', chalk.yellow(`${overallScore}/100`), rating.stars);
    console.log('Rating:', chalk.yellow(rating.grade), `(${rating.level})`);
    console.log('');
    console.log('Summary:');
    console.log(`  Total Tests: ${total}`);
    console.log(`  Passed: ${chalk.green(passed)} (${passRate}%)`);
    console.log(`  Failed: ${chalk.red(failed)}`);
    console.log(`  Avg Duration: ${avgDuration}ms`);
    console.log('');

    // Skill 详情
    console.log('Skill Breakdown:');
    console.log('─'.repeat(50));
    console.log(
      `${'Skill'.padEnd(20)} ${'Score'.padEnd(10)} ${'Passed'.padEnd(10)} ${'Status'}`
    );
    console.log('─'.repeat(50));
    
    for (const [skill, stats] of Object.entries(bySkill)) {
      const score = Math.floor((stats.passed / stats.total) * 100);
      const status = score >= 90 ? chalk.green('✓ Excellent') : 
                     score >= 80 ? chalk.yellow('✓ Good') : 
                     chalk.red('✗ Needs Work');
      
      console.log(
        `${skill.padEnd(20)} ${(`${score}%`).padEnd(10)} ${(`${stats.passed}/${stats.total}`).padEnd(10)} ${status}`
      );
    }

    console.log('─'.repeat(50));

    // 失败的测试
    const failures = this.results.filter(r => !r.success);
    if (failures.length > 0) {
      console.log('\nFailed Tests:');
      for (const f of failures) {
        console.log(chalk.red(`  ✗ ${f.id}: ${f.name}`));
      }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(chalk.gray('Report generated at: reports/report.html'));
    console.log(chalk.gray('Detailed logs: reports/detailed.log'));

    // 生成示例 HTML 报告
    await this.generateHTMLReport(overallScore, rating, bySkill);
  }

  getRating(score) {
    if (score >= 95) return { grade: 'A+', stars: '⭐⭐⭐⭐⭐', level: '卓越' };
    if (score >= 90) return { grade: 'A', stars: '⭐⭐⭐⭐⭐', level: '优秀' };
    if (score >= 85) return { grade: 'B+', stars: '⭐⭐⭐⭐☆', level: '良好' };
    if (score >= 80) return { grade: 'B', stars: '⭐⭐⭐⭐', level: '合格' };
    if (score >= 70) return { grade: 'C', stars: '⭐⭐⭐☆', level: '及格' };
    return { grade: 'D', stars: '⭐⭐⭐', level: '不合格' };
  }

  async generateHTMLReport(overallScore, rating, bySkill) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>DTAgent Evaluation Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 900px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; border-radius: 10px; }
    .card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .score { font-size: 48px; font-weight: bold; color: #667eea; }
    .badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 14px; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f8f9fa; }
    .footer { text-align: center; margin-top: 40px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>DTAgent Skill Evaluation Report</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="card">
      <div class="score">${overallScore}/100</div>
      <div style="font-size: 24px; margin-top: 10px;">${rating.stars} ${rating.grade}</div>
      <div style="color: #666; margin-top: 5px;">${rating.level}</div>
    </div>
    
    <div class="card">
      <h2>Skill Breakdown</h2>
      <table>
        <tr>
          <th>Skill</th>
          <th>Score</th>
          <th>Status</th>
        </tr>
        ${Object.entries(bySkill).map(([skill, stats]) => {
          const score = Math.floor((stats.passed / stats.total) * 100);
          const status = score >= 90 ? '<span class="badge badge-success">Excellent</span>' :
                        score >= 80 ? '<span class="badge badge-warning">Good</span>' :
                        '<span class="badge badge-danger">Needs Work</span>';
          return `<tr>
            <td>${skill}</td>
            <td>${score}%</td>
            <td>${status}</td>
          </tr>`;
        }).join('')}
      </table>
    </div>
    
    <div class="footer">
      <p>DTAgent Evaluator v1.0.0</p>
    </div>
  </div>
</body>
</html>`;

    await fs.ensureDir('./reports');
    await fs.writeFile('./reports/report.html', html);
    
    console.log(chalk.green('\n✅ HTML report generated: reports/report.html'));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 运行演示
const demo = new DemoEvaluator();
demo.run().catch(console.error);
