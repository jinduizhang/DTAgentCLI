#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const packageJson = require('../package.json');

program
  .name('dtagent')
  .description('DTAgent CLI - 智能化 Java 单元测试生成工具')
  .version(packageJson.version);

// Init command
program
  .command('init [file]')
  .description('初始化 DTAgent 配置')
  .option('-d, --dry-run', '仅显示将要执行的操作，不实际执行')
  .option('-f, --force', '强制覆盖已有配置')
  .action(async (file, options) => {
    const { initCommand } = require('../dist/commands/init');
    await initCommand({ ...options, file });
  });

// Generate command
program
  .command('generate')
  .description('生成单元测试')
  .option('-f, --file <path>', '为单个文件生成测试')
  .option('-d, --dir <path>', '为目录中所有文件生成测试')
  .option('-r, --recursive', '递归扫描子目录')
  .option('-p, --parallel <n>', '并行执行的任务数', '1')
  .option('--skip-existing', '跳过已有测试的文件')
  .action(async (options) => {
    const { generateCommand } = require('../dist/commands/generate');
    await generateCommand(options);
  });

// Fix command (placeholder for Phase 2)
program
  .command('fix')
  .description('修复失败的测试')
  .option('-f, --file <path>', '修复指定文件的测试')
  .option('--all', '修复所有失败的测试')
  .action(async (options) => {
    console.log(chalk.yellow('fix 命令尚未实现，将在二期开发'));
  });

// Coverage command (placeholder for Phase 2)
program
  .command('coverage')
  .description('分析测试覆盖率')
  .option('-t, --threshold <n>', '最低覆盖率阈值', '80')
  .action(async (options) => {
    console.log(chalk.yellow('coverage 命令尚未实现，将在二期开发'));
  });

// MR command (placeholder for Phase 3)
program
  .command('mr')
  .description('为 MR 变更生成测试')
  .option('-b, --base <branch>', '基准分支', 'main')
  .action(async (options) => {
    console.log(chalk.yellow('mr 命令尚未实现，将在三期开发'));
  });

// Extract experience command
program
  .command('extract-experience')
  .description('提取 Mock 经验并保存到经验库')
  .option('-f, --file <path>', '从单个测试文件提取')
  .option('-d, --dir <path>', '从目录中所有测试文件提取')
  .option('-s, --save', '保存提取的模式到经验库')
  .action(async (options) => {
    const { extractExperienceCommand } = require('../dist/commands/extract-experience');
    await extractExperienceCommand(options);
  });

program.parse();