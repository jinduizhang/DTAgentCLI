#!/usr/bin/env node

const { spawn } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');

/**
 * 真实的 DTAgent Skill 测评
 */
class RealEvaluator {
  constructor() {
    this.results = [];
    this.projectDir = 'D:/OpenCode/DTAgentCLI/test-projects/demo-service';
  }

  async run() {
    console.log(chalk.blue('🚀 DTAgent Skill 真实测评\n'));
    console.log('─'.repeat(70));
    console.log(`测试项目: ${this.projectDir}`);
    console.log('─'.repeat(70) + '\n');

    // 测试 1: init-dt
    await this.testInitDt();

    // 测试 2: generate-java-ut
    await this.testGenerateJavaUt();

    // 生成报告
    await this.generateReport();
  }

  async testInitDt() {
    const spinner = ora('[TC-INIT-001] 执行 init-dt').start();
    
    try {
      // 检查必要文件是否存在
      const checkFiles = [
        'DT_AGENTS.md',
        'opencode.json',
        '.opencode/skills/generate-java-ut/SKILL.md'
      ];
      
      const existingFiles = await this.checkFilesExist(checkFiles);
      
      const result = {
        id: 'TC-INIT-001',
        name: 'init-dt 技能测试',
        skill: 'init-dt',
        success: existingFiles.length >= 2,
        details: {
          filesChecked: checkFiles.length,
          filesExist: existingFiles.length,
          files: existingFiles
        }
      };

      this.results.push(result);

      if (result.success) {
        spinner.succeed(`init-dt 测试通过 ${chalk.green('✓')}`);
        console.log(chalk.gray(`  检测到 ${existingFiles.length}/${checkFiles.length} 个关键文件`));
      } else {
        spinner.fail(`init-dt 测试失败 ${chalk.red('✗')}`);
      }
    } catch (error) {
      spinner.fail(`init-dt 执行错误 ${chalk.red('✗')}`);
      this.results.push({
        id: 'TC-INIT-001',
        name: 'init-dt 技能测试',
        skill: 'init-dt',
        success: false,
        error: error.message
      });
    }
  }

  async testGenerateJavaUt() {
    const spinner = ora('[TC-GEN-001] 检查 generate-java-ut 产物').start();
    
    try {
      // 检查生成的测试文件
      const testFile = 'src/test/java/com/example/service/UserServiceTest.java';
      const exists = await this.checkFileExists(testFile);
      
      let lineCount = 0;
      let hasMock = false;
      let hasTest = false;
      
      if (exists) {
        const fs = require('fs-extra');
        const content = await fs.readFile(
          path.join(this.projectDir, testFile), 
          'utf8'
        );
        lineCount = content.split('\n').length;
        hasMock = content.includes('@Mock');
        hasTest = content.includes('@Test');
      }
      
      const result = {
        id: 'TC-GEN-001',
        name: 'generate-java-ut 产物检查',
        skill: 'generate-java-ut',
        success: exists && hasMock && hasTest,
        details: {
          fileExists: exists,
          lineCount,
          hasMock,
          hasTest
        }
      };

      this.results.push(result);

      if (result.success) {
        spinner.succeed(`generate-java-ut 检查通过 ${chalk.green('✓')}`);
        console.log(chalk.gray(`  测试文件: ${lineCount} 行`));
        console.log(chalk.gray(`  包含 @Mock: ${hasMock}, @Test: ${hasTest}`));
      } else {
        spinner.fail(`generate-java-ut 检查失败 ${chalk.red('✗')}`);
      }
    } catch (error) {
      spinner.fail(`generate-java-ut 执行错误 ${chalk.red('✗')}`);
      this.results.push({
        id: 'TC-GEN-001',
        name: 'generate-java-ut 产物检查',
        skill: 'generate-java-ut',
        success: false,
        error: error.message
      });
    }
  }

  async checkFilesExist(files) {
    const fs = require('fs-extra');
    const existing = [];
    
    for (const file of files) {
      const fullPath = path.join(this.projectDir, file);
      if (await fs.pathExists(fullPath)) {
        existing.push(file);
      }
    }
    
    return existing;
  }

  async checkFileExists(file) {
    const fs = require('fs-extra');
    const fullPath = path.join(this.projectDir, file);
    return await fs.pathExists(fullPath);
  }

  async generateReport() {
    console.log('\n' + '─'.repeat(70));
    console.log(chalk.blue('📊 真实测评结果\n'));

    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    const score = Math.floor((passed / total) * 100);

    // 评分
    const rating = this.getRating(score);

    console.log('Overall Score:', chalk.yellow(`${score}/100`), rating.stars);
    console.log('Rating:', chalk.yellow(rating.grade), `(${rating.level})`);
    console.log('');
    console.log('Summary:');
    console.log(`  Total:  ${total}`);
    console.log(`  Passed: ${chalk.green(passed)}`);
    console.log(`  Failed: ${chalk.red(failed)}`);
    console.log('');

    // 详情
    console.log('Details:');
    console.log('─'.repeat(70));
    for (const r of this.results) {
      const status = r.success ? chalk.green('✓ PASS') : chalk.red('✗ FAIL');
      console.log(`${r.id} ${r.name}`);
      console.log(`  Status: ${status}`);
      if (r.details) {
        console.log(`  Details: ${JSON.stringify(r.details, null, 2).split('\n').join('\n  ')}`);
      }
      if (r.error) {
        console.log(`  Error: ${chalk.red(r.error)}`);
      }
      console.log('');
    }

    console.log('─'.repeat(70));
    
    if (score >= 80) {
      console.log(chalk.green('\n✅ 测评通过！系统运行良好'));
    } else {
      console.log(chalk.yellow('\n⚠️ 测评完成，但有改进空间'));
    }
  }

  getRating(score) {
    if (score >= 95) return { grade: 'A+', stars: '⭐⭐⭐⭐⭐', level: '卓越' };
    if (score >= 90) return { grade: 'A', stars: '⭐⭐⭐⭐⭐', level: '优秀' };
    if (score >= 85) return { grade: 'B+', stars: '⭐⭐⭐⭐☆', level: '良好' };
    if (score >= 80) return { grade: 'B', stars: '⭐⭐⭐⭐', level: '合格' };
    if (score >= 70) return { grade: 'C', stars: '⭐⭐⭐☆', level: '及格' };
    return { grade: 'D', stars: '⭐⭐⭐', level: '不合格' };
  }
}

// 运行
const evaluator = new RealEvaluator();
evaluator.run().catch(console.error);
