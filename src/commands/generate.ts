/**
 * Generate command - Generate unit tests for source files
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { saveReports } from '../utils/report';

export interface GenerateOptions {
  file?: string;
  dir?: string;
  recursive?: boolean;
  parallel?: string;
  skipExisting?: boolean;
}

export interface GenerateResult {
  source: string;
  test?: string;
  status: 'success' | 'failed' | 'skipped';
  message?: string;
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  console.log(chalk.blue.bold('\n🧪 DTAgent 生成测试\n'));

  if (!options.file && !options.dir) {
    console.error(chalk.red('错误: 请指定 --file 或 --dir'));
    console.log(chalk.gray('\n用法:'));
    console.log(chalk.gray('  dtagent generate --file src/main/java/Service.java'));
    console.log(chalk.gray('  dtagent generate --dir src/main/java --recursive'));
    process.exit(1);
  }

  const spinner = ora('准备生成测试...').start();
  const projectDir = process.cwd();

  try {
    // Check if DT_AGENTS.md exists
    const configPath = path.join(projectDir, 'DT_AGENTS.md');
    if (!fs.existsSync(configPath)) {
      spinner.fail('DT_AGENTS.md 未找到，请先运行 `dtagent init`');
      process.exit(1);
    }

    // Check if opencode is available
    if (!isOpencodeAvailable()) {
      spinner.fail('opencode 命令未找到，请先安装 OpenCode');
      process.exit(1);
    }

    if (options.file) {
      // Single file mode
      spinner.text = `正在为 ${path.basename(options.file)} 生成测试...`;
      const result = await generateSingleFile(projectDir, options.file, options.skipExisting);
      
      if (result.status === 'success') {
        spinner.succeed(`已为 ${path.basename(options.file)} 生成测试`);
        console.log(chalk.gray(`  源文件: ${result.source}`));
        if (result.test) {
          console.log(chalk.gray(`  测试文件: ${result.test}`));
        }
        // Save report
        saveReports([result], `generate --file ${options.file}`, projectDir);
      } else if (result.status === 'skipped') {
        spinner.warn(`跳过 ${path.basename(options.file)}: ${result.message}`);
      } else {
        spinner.fail(`为 ${path.basename(options.file)} 生成测试失败`);
        console.error(chalk.red(`  错误: ${result.message}`));
        // Save report even for failures
        saveReports([result], `generate --file ${options.file}`, projectDir);
      }
    } else if (options.dir) {
      // Batch mode
      spinner.text = '扫描目录...';
      const files = await scanDirectory(projectDir, options.dir, options.recursive);
      
      if (files.length === 0) {
        spinner.warn('指定目录中未找到 Java 源文件');
        return;
      }

      console.log(chalk.gray(`\n  发现 ${files.length} 个源文件`));
      
      const parallel = parseInt(options.parallel || '1');
      spinner.text = '正在生成测试...';
      
      const results = await generateBatch(projectDir, files, parallel, options.skipExisting);
      
      // Print summary
      spinner.succeed('批量生成完成');
      printSummary(results);
      
      // Save report
      saveReports(results, `generate --dir ${options.dir}`, projectDir);
      console.log(chalk.gray('\n  报告已保存到 .dtagent/reports/'));
    }

  } catch (error) {
    spinner.fail('生成失败');
    console.error(chalk.red(`\n❌ 错误: ${error}`));
    process.exit(1);
  }
}

/**
 * Check if opencode command is available
 */
function isOpencodeAvailable(): boolean {
  try {
    spawn('opencode', ['--version'], { shell: true, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate test for a single file
 */
async function generateSingleFile(
  projectDir: string, 
  filePath: string, 
  skipExisting?: boolean
): Promise<GenerateResult> {
  // Resolve absolute path
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.resolve(projectDir, filePath);

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    return {
      source: filePath,
      status: 'failed',
      message: 'Source file not found',
    };
  }

  // Check if test already exists
  const testPath = getTestPath(projectDir, absolutePath);
  if (skipExisting && testPath && fs.existsSync(testPath)) {
    return {
      source: filePath,
      test: testPath,
      status: 'skipped',
      message: 'Test file already exists',
    };
  }

  // Build prompt for opencode
  const prompt = buildGeneratePrompt(absolutePath);

  // Execute opencode
  try {
    await executeOpencode(prompt);
    
    return {
      source: filePath,
      test: testPath || undefined,
      status: 'success',
    };
  } catch (error) {
    return {
      source: filePath,
      status: 'failed',
      message: String(error),
    };
  }
}

/**
 * Get the expected test file path
 */
function getTestPath(projectDir: string, sourcePath: string): string | null {
  // Convert source path to test path
  // src/main/java/com/example/Service.java -> src/test/java/com/example/ServiceTest.java
  
  const relativePath = path.relative(projectDir, sourcePath);
  
  if (!relativePath.includes('src/main/java')) {
    return null;
  }

  const testPath = relativePath
    .replace('src/main/java', 'src/test/java')
    .replace('.java', 'Test.java');

  return path.join(projectDir, testPath);
}

/**
 * Build prompt for opencode
 */
function buildGeneratePrompt(sourcePath: string): string {
  return `@generate-java-ut 请为以下Java源文件生成完整的单元测试：\n\n文件路径：${sourcePath}\n\n要求：\n1. 使用JUnit 5和Mockito\n2. 覆盖正常路径、边界条件和异常处理\n3. 遵循Given-When-Then模式\n4. 使用有意义的测试方法名称`;
}

/**
 * Execute opencode command
 */
function executeOpencode(prompt: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('opencode', ['-p', prompt], {
      shell: true,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`opencode exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Scan directory for Java source files
 */
async function scanDirectory(
  projectDir: string, 
  dirPath: string, 
  recursive?: boolean
): Promise<string[]> {
  const results: string[] = [];
  
  const absoluteDir = path.isAbsolute(dirPath) 
    ? dirPath 
    : path.resolve(projectDir, dirPath);

  if (!fs.existsSync(absoluteDir)) {
    return results;
  }

  function scan(dir: string): void {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && recursive) {
        scan(fullPath);
      } else if (stat.isFile() && item.endsWith('.java') && !item.endsWith('Test.java')) {
        results.push(fullPath);
      }
    }
  }

  scan(absoluteDir);
  return results;
}

/**
 * Generate tests for multiple files
 */
async function generateBatch(
  projectDir: string,
  files: string[],
  parallel: number,
  skipExisting?: boolean
): Promise<GenerateResult[]> {
  const results: GenerateResult[] = [];
  
  // Process in batches based on parallel count
  for (let i = 0; i < files.length; i += parallel) {
    const batch = files.slice(i, i + parallel);
    
    const batchPromises = batch.map(file => 
      generateSingleFile(projectDir, file, skipExisting)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Progress indicator
    const progress = Math.min(i + parallel, files.length);
    console.log(chalk.gray(`  进度: ${progress}/${files.length}`));
  }

  return results;
}

/**
 * Print generation summary
 */
function printSummary(results: GenerateResult[]): void {
  const success = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  console.log(chalk.green('\n📊 生成汇总:'));
  console.log(chalk.white(`  总计: ${results.length}`));
  console.log(chalk.green(`  ✅ 成功: ${success}`));
  
  if (skipped > 0) {
    console.log(chalk.yellow(`  ⏭️ 跳过: ${skipped}`));
  }
  
  if (failed > 0) {
    console.log(chalk.red(`  ❌ 失败: ${failed}`));
    console.log(chalk.red('\n失败文件:'));
    results
      .filter(r => r.status === 'failed')
      .forEach(r => {
        console.log(chalk.red(`  - ${r.source}: ${r.message}`));
      });
  }

  console.log();
}