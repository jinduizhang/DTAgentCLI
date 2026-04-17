const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs-extra');

const { TestLoader } = require('./TestLoader');
const { SkillExecutor } = require('./SkillExecutor');
const { MetricsAnalyzer } = require('./MetricsAnalyzer');
const { ReportGenerator } = require('./ReportGenerator');
const { BaselineComparator } = require('./BaselineComparator');
const { ConfigManager } = require('../utils/ConfigManager');
const { Logger } = require('../utils/Logger');

/**
 * 核心测评运行器
 * 协调整个测评流程：加载 -> 执行 -> 分析 -> 报告
 */
class Runner {
  constructor(options = {}) {
    this.config = ConfigManager.load(options.configPath);
    this.logger = new Logger(this.config.logLevel);
    this.results = [];
    this.startTime = null;
  }

  /**
   * 运行所有测试
   */
  async runAll() {
    this.logger.info(chalk.blue('🚀 Starting DTAgent Skill Evaluation'));
    this.startTime = Date.now();

    try {
      // 1. 加载所有测试用例
      const testCases = await this.loadAllTestCases();
      this.logger.info(`📋 Loaded ${testCases.length} test cases`);

      // 2. 执行测试
      const results = await this.executeTests(testCases);

      // 3. 分析指标
      const metrics = await this.analyzeMetrics(results);

      // 4. 对比基准
      const comparison = await this.compareWithBaseline(metrics);

      // 5. 生成报告
      await this.generateReport(metrics, comparison);

      // 6. 返回结果
      return this.summarizeResults(metrics);

    } catch (error) {
      this.logger.error('Evaluation failed:', error);
      throw error;
    }
  }

  /**
   * 运行特定 Skill
   */
  async runSkill(skillName) {
    this.logger.info(chalk.blue(`🎯 Evaluating Skill: ${skillName}`));

    const testCases = await TestLoader.loadBySkill(skillName);
    const results = await this.executeTests(testCases);
    const metrics = await this.analyzeMetrics(results);

    return metrics;
  }

  /**
   * 运行特定测试用例
   */
  async runCase(caseId) {
    this.logger.info(chalk.blue(`🧪 Running Test Case: ${caseId}`));

    const testCase = await TestLoader.loadById(caseId);
    const result = await this.executeSingleTest(testCase);
    
    return result;
  }

  /**
   * 对比模式
   */
  async runComparison(baseline, current) {
    this.logger.info(chalk.blue('📊 Running Comparison Mode'));

    const comparator = new BaselineComparator(this.config);
    const comparison = await comparator.compare(baseline, current);

    await this.generateComparisonReport(comparison);

    return comparison;
  }

  /**
   * CI 模式（简洁输出）
   */
  async runCI() {
    this.logger.info(chalk.blue('🔧 Running in CI Mode'));

    const results = await this.runAll();
    
    // 检查阈值
    const passed = this.checkThresholds(results);
    
    if (!passed) {
      process.exit(1);
    }

    return results;
  }

  // ============ 私有方法 ============

  /**
   * 加载所有测试用例
   */
  async loadAllTestCases() {
    const spinner = ora('Loading test cases...').start();
    
    try {
      const testCases = await TestLoader.loadAll();
      spinner.succeed(`Loaded ${testCases.length} test cases`);
      return testCases;
    } catch (error) {
      spinner.fail('Failed to load test cases');
      throw error;
    }
  }

  /**
   * 执行测试
   */
  async executeTests(testCases) {
    const results = [];
    const total = testCases.length;

    this.logger.info(chalk.yellow(`\n⚡ Executing ${total} tests...\n`));

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const spinner = ora(`[${i + 1}/${total}] ${testCase.name}`).start();

      try {
        const result = await this.executeSingleTest(testCase);
        results.push(result);

        if (result.success) {
          spinner.succeed(`[${i + 1}/${total}] ${testCase.name} ${chalk.green('✓')}`);
        } else {
          spinner.fail(`[${i + 1}/${total}] ${testCase.name} ${chalk.red('✗')}`);
        }
      } catch (error) {
        spinner.fail(`[${i + 1}/${total}] ${testCase.name} ${chalk.red('✗')}`);
        results.push({
          ...testCase,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 执行单个测试
   */
  async executeSingleTest(testCase) {
    const executor = new SkillExecutor(this.config);
    
    const result = await executor.execute(testCase);
    
    // 记录详细日志
    this.logger.debug('Test result:', {
      id: testCase.id,
      success: result.success,
      duration: result.duration
    });

    return result;
  }

  /**
   * 分析指标
   */
  async analyzeMetrics(results) {
    const spinner = ora('Analyzing metrics...').start();
    
    try {
      const analyzer = new MetricsAnalyzer(this.config);
      const metrics = await analyzer.analyze(results);
      
      spinner.succeed('Metrics analyzed');
      return metrics;
    } catch (error) {
      spinner.fail('Failed to analyze metrics');
      throw error;
    }
  }

  /**
   * 对比基准
   */
  async compareWithBaseline(metrics) {
    if (!this.config.comparison?.enabled) {
      return null;
    }

    const spinner = ora('Comparing with baseline...').start();
    
    try {
      const comparator = new BaselineComparator(this.config);
      const comparison = await comparator.compareWithCurrent(metrics);
      
      spinner.succeed('Comparison completed');
      return comparison;
    } catch (error) {
      spinner.warn('Failed to compare with baseline');
      return null;
    }
  }

  /**
   * 生成报告
   */
  async generateReport(metrics, comparison) {
    const spinner = ora('Generating report...').start();
    
    try {
      const generator = new ReportGenerator(this.config);
      await generator.generate({
        metrics,
        comparison,
        timestamp: new Date(),
        duration: Date.now() - this.startTime
      });
      
      spinner.succeed('Report generated');
    } catch (error) {
      spinner.fail('Failed to generate report');
      throw error;
    }
  }

  /**
   * 检查阈值
   */
  checkThresholds(results) {
    const { thresholds } = this.config;
    
    let allPassed = true;
    
    for (const [skill, score] of Object.entries(results.skillScores)) {
      const threshold = thresholds[skill] || thresholds.overall;
      
      if (score < threshold) {
        this.logger.error(
          chalk.red(`❌ ${skill}: ${score} < threshold ${threshold}`)
        );
        allPassed = false;
      } else {
        this.logger.info(
          chalk.green(`✅ ${skill}: ${score} >= threshold ${threshold}`)
        );
      }
    }

    return allPassed;
  }

  /**
   * 汇总结果
   */
  summarizeResults(metrics) {
    const duration = Date.now() - this.startTime;
    const { total, passed, failed } = metrics.summary;

    this.logger.info(chalk.blue('\n📊 Evaluation Summary'));
    this.logger.info('─'.repeat(50));
    this.logger.info(`Total Tests:    ${total}`);
    this.logger.info(`Passed:         ${chalk.green(passed)}`);
    this.logger.info(`Failed:         ${chalk.red(failed)}`);
    this.logger.info(`Success Rate:   ${(passed / total * 100).toFixed(1)}%`);
    this.logger.info(`Overall Score:  ${chalk.yellow(metrics.overallScore)}`);
    this.logger.info(`Duration:       ${(duration / 1000).toFixed(1)}s`);
    this.logger.info('─'.repeat(50));

    return {
      success: failed === 0,
      metrics,
      duration
    };
  }
}

// ============ CLI 入口 ============

const program = new Command();

program
  .name('dtagent-eval')
  .description('DTAgent Skill Evaluation Framework')
  .version('1.0.0');

program
  .option('-c, --config <path>', 'config file path')
  .option('-v, --verbose', 'verbose output')
  .option('--ci', 'CI mode (minimal output)')
  .option('--parallel <n>', 'parallel execution', '4');

// 运行所有测试
program
  .command('all')
  .description('Run all evaluations')
  .action(async () => {
    const runner = new Runner(program.opts());
    const results = await runner.runAll();
    process.exit(results.success ? 0 : 1);
  });

// 运行特定 Skill
program
  .command('skill <name>')
  .description('Evaluate specific skill')
  .action(async (name) => {
    const runner = new Runner(program.opts());
    const results = await runner.runSkill(name);
    console.log(JSON.stringify(results, null, 2));
  });

// 运行特定用例
program
  .command('case <id>')
  .description('Run specific test case')
  .action(async (id) => {
    const runner = new Runner(program.opts());
    const result = await runner.runCase(id);
    console.log(JSON.stringify(result, null, 2));
  });

// 对比模式
program
  .command('compare')
  .description('Compare with baseline')
  .requiredOption('-b, --baseline <path>', 'baseline results path')
  .option('-c, --current <path>', 'current results path')
  .action(async (opts) => {
    const runner = new Runner(program.opts());
    const comparison = await runner.runComparison(opts.baseline, opts.current);
    console.log(JSON.stringify(comparison, null, 2));
  });

// 默认执行
if (require.main === module) {
  program.parse();
}

module.exports = { Runner };
