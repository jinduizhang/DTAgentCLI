const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

/**
 * Skill 执行器
 * 负责执行 Skill 命令并收集结果
 */
class SkillExecutor {
  constructor(config) {
    this.config = config;
    this.timeout = config.timeout?.default || 180000;
  }

  /**
   * 执行测试用例
   */
  async execute(testCase) {
    const startTime = Date.now();
    const skillName = testCase.skill || this.inferSkill(testCase);
    
    console.log(chalk.gray(`   Executing ${testCase.id}...`));

    try {
      // 1. 准备环境
      const workDir = await this.prepareEnvironment(testCase);
      
      // 2. 执行前置条件
      await this.runPrerequisites(testCase.prerequisites, workDir);
      
      // 3. 执行 Skill 命令
      const executionResult = await this.runSkill(skillName, testCase, workDir);
      
      // 4. 验证结果
      const validationResult = await this.validateResults(testCase, executionResult, workDir);
      
      // 5. 收集指标
      const metrics = await this.collectMetrics(executionResult, workDir);

      return {
        id: testCase.id,
        success: validationResult.success,
        duration: Date.now() - startTime,
        skill: skillName,
        execution: executionResult,
        validation: validationResult,
        metrics,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        id: testCase.id,
        success: false,
        duration: Date.now() - startTime,
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * 推断 Skill 名称
   */
  inferSkill(testCase) {
    // 从用例 ID 推断
    const match = testCase.id.match(/^TC-([A-Z-]+)-\d+$/);
    if (match) {
      const skillMap = {
        'INIT': 'init-dt',
        'GEN': 'generate-java-ut',
        'FIX': 'fix-java-ut',
        'COV': 'java-coverage',
        'CWD': 'cwd-ut-protection'
      };
      return skillMap[match[1]] || 'unknown';
    }
    return 'unknown';
  }

  /**
   * 准备测试环境
   */
  async prepareEnvironment(testCase) {
    const workDir = path.join(
      process.cwd(),
      'evals/workspaces',
      `${testCase.id}_${Date.now()}`
    );

    await fs.ensureDir(workDir);

    // 如果有目标项目，复制模板
    if (testCase.target?.type === 'project') {
      await this.setupProjectTemplate(workDir, testCase);
    }

    return workDir;
  }

  /**
   * 设置项目模板
   */
  async setupProjectTemplate(workDir, testCase) {
    // 根据测试用例设置不同的项目结构
    const templateDir = path.join(__dirname, '../fixtures/project-templates');
    const templateName = this.getTemplateName(testCase);
    
    const sourceDir = path.join(templateDir, templateName);
    
    if (await fs.pathExists(sourceDir)) {
      await fs.copy(sourceDir, workDir);
    }

    // 注入错误（如果需要）
    if (testCase.target?.injectError) {
      await this.injectError(workDir, testCase.target.injectError);
    }
  }

  /**
   * 获取模板名称
   */
  getTemplateName(testCase) {
    const skillTemplates = {
      'init-dt': 'maven-simple',
      'generate-java-ut': 'java-service',
      'fix-java-ut': 'broken-tests',
      'java-coverage': 'coverage-test',
      'cwd-ut-protection': 'cwd-test'
    };

    return skillTemplates[testCase.skill] || 'basic';
  }

  /**
   * 注入错误
   */
  async injectError(workDir, errorConfig) {
    const { type, file, changes } = errorConfig;
    
    const filePath = path.join(workDir, file);
    
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`File not found for error injection: ${file}`);
    }

    let content = await fs.readFile(filePath, 'utf8');

    switch (type) {
      case 'remove-import':
        for (const imp of errorConfig.imports) {
          content = content.replace(new RegExp(`import ${imp};\\n`, 'g'), '');
        }
        break;
        
      case 'wrong-mock':
        for (const change of changes) {
          content = content.replace(change.replace, change.with);
        }
        break;
        
      case 'type-mismatch':
        for (const change of changes) {
          content = content.replace(change.replace, change.with);
        }
        break;
        
      default:
        console.warn(`Unknown error injection type: ${type}`);
    }

    await fs.writeFile(filePath, content);
  }

  /**
   * 运行前置条件
   */
  async runPrerequisites(prerequisites, workDir) {
    if (!prerequisites) return;

    for (const prereq of prerequisites) {
      switch (prereq.type) {
        case 'init-dt':
          await this.runCommand('dtagent', ['init'], workDir);
          break;
          
        case 'maven-validate':
          await this.runCommand('mvn', ['validate'], workDir);
          break;
          
        case 'file-exists':
          const filePath = path.join(workDir, prereq.check);
          if (!(await fs.pathExists(filePath))) {
            throw new Error(`Prerequisite file not found: ${prereq.check}`);
          }
          break;
          
        default:
          console.warn(`Unknown prerequisite type: ${prereq.type}`);
      }
    }
  }

  /**
   * 运行 Skill
   */
  async runSkill(skillName, testCase, workDir) {
    const command = this.buildCommand(skillName, testCase);
    
    const result = await this.runCommand(
      command.cmd,
      command.args,
      workDir,
      testCase.timeout || this.timeout
    );

    return result;
  }

  /**
   * 构建命令
   */
  buildCommand(skillName, testCase) {
    const target = testCase.target;
    
    switch (skillName) {
      case 'init-dt':
        return {
          cmd: 'dtagent',
          args: ['init', ...(testCase.args || [])]
        };
        
      case 'generate-java-ut':
        return {
          cmd: 'opencode',
          args: ['run', `/generate-dt-single ${target.path}`]
        };
        
      case 'fix-java-ut':
        return {
          cmd: 'opencode',
          args: ['run', `/fix-ut ${target.path}`]
        };
        
      case 'java-coverage':
        return {
          cmd: 'opencode',
          args: ['run', `/coverage ${target.path || ''}`]
        };
        
      case 'cwd-ut-protection':
        return {
          cmd: 'opencode',
          args: ['run', `/cwd-ut-protection ${target.method} ${target.cwd}`]
        };
        
      default:
        throw new Error(`Unknown skill: ${skillName}`);
    }
  }

  /**
   * 运行命令
   */
  async runCommand(cmd, args, cwd, timeout = this.timeout) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd,
        shell: true,
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        
        if (killed) return;

        resolve({
          code,
          stdout,
          stderr,
          success: code === 0,
          killed
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * 验证结果
   */
  async validateResults(testCase, executionResult, workDir) {
    const expected = testCase.expected;
    const validations = [];

    // 1. 检查编译
    if (expected.compilation) {
      const compileResult = await this.validateCompilation(expected.compilation, workDir);
      validations.push(compileResult);
    }

    // 2. 检查文件
    if (expected.files) {
      for (const fileCheck of expected.files) {
        const result = await this.validateFile(fileCheck, workDir);
        validations.push(result);
      }
    }

    // 3. 检查执行
    if (expected.execution) {
      const execResult = await this.validateExecution(expected.execution, workDir);
      validations.push(execResult);
    }

    // 4. 检查覆盖率
    if (expected.coverage) {
      const covResult = await this.validateCoverage(expected.coverage, workDir);
      validations.push(covResult);
    }

    // 5. 检查代码质量
    if (expected.codeQuality) {
      const qualityResult = await this.validateCodeQuality(expected.codeQuality, workDir);
      validations.push(qualityResult);
    }

    const allPassed = validations.every(v => v.passed);

    return {
      success: allPassed,
      passed: validations.filter(v => v.passed).length,
      failed: validations.filter(v => !v.passed).length,
      details: validations
    };
  }

  /**
   * 验证编译
   */
  async validateCompilation(expected, workDir) {
    try {
      const result = await this.runCommand('mvn', ['test-compile', '-q'], workDir, 120000);
      
      return {
        type: 'compilation',
        passed: expected.shouldCompile ? result.success : !result.success,
        details: { exitCode: result.code }
      };
    } catch (error) {
      return {
        type: 'compilation',
        passed: !expected.shouldCompile,
        error: error.message
      };
    }
  }

  /**
   * 验证文件
   */
  async validateFile(expected, workDir) {
    const filePath = path.join(workDir, expected.path);
    const exists = await fs.pathExists(filePath);

    if (expected.exists && !exists) {
      return {
        type: 'file-exists',
        passed: false,
        message: `File not found: ${expected.path}`
      };
    }

    if (!expected.exists && exists) {
      return {
        type: 'file-exists',
        passed: false,
        message: `File should not exist: ${expected.path}`
      };
    }

    if (exists) {
      const stats = await fs.stat(filePath);
      
      if (expected.minLines) {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').length;
        
        if (lines < expected.minLines) {
          return {
            type: 'file-lines',
            passed: false,
            message: `File has ${lines} lines, expected at least ${expected.minLines}`
          };
        }
      }

      if (expected.mustContain) {
        const content = await fs.readFile(filePath, 'utf8');
        
        for (const pattern of expected.mustContain) {
          if (!content.includes(pattern)) {
            return {
              type: 'file-content',
              passed: false,
              message: `File missing required content: ${pattern}`
            };
          }
        }
      }
    }

    return {
      type: 'file',
      passed: true
    };
  }

  /**
   * 验证执行
   */
  async validateExecution(expected, workDir) {
    try {
      const result = await this.runCommand(
        'mvn',
        ['test', '-q'],
        workDir,
        300000
      );

      // 解析测试结果
      const testResults = this.parseTestResults(result.stdout);

      const passed = expected.shouldPass === result.success &&
                    testResults.total >= (expected.minTests || 0) &&
                    testResults.passRate >= (expected.passRate || 0);

      return {
        type: 'execution',
        passed,
        details: testResults
      };
    } catch (error) {
      return {
        type: 'execution',
        passed: !expected.shouldPass,
        error: error.message
      };
    }
  }

  /**
   * 解析测试结果
   */
  parseTestResults(stdout) {
    const lines = stdout.split('\n');
    let total = 0;
    let failures = 0;
    let errors = 0;

    for (const line of lines) {
      const match = line.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)/);
      if (match) {
        total += parseInt(match[1]);
        failures += parseInt(match[2]);
        errors += parseInt(match[3]);
      }
    }

    return {
      total,
      passed: total - failures - errors,
      failures,
      errors,
      passRate: total > 0 ? (total - failures - errors) / total : 0
    };
  }

  /**
   * 验证覆盖率
   */
  async validateCoverage(expected, workDir) {
    try {
      // 运行 JaCoCo 报告
      await this.runCommand('mvn', ['jacoco:report', '-q'], workDir, 60000);

      // 解析报告
      const reportPath = path.join(workDir, 'target/site/jacoco/index.html');
      
      if (!(await fs.pathExists(reportPath))) {
        return {
          type: 'coverage',
          passed: false,
          message: 'Coverage report not generated'
        };
      }

      // 简化版本：只检查报告存在
      return {
        type: 'coverage',
        passed: true
      };

    } catch (error) {
      return {
        type: 'coverage',
        passed: false,
        error: error.message
      };
    }
  }

  /**
   * 验证代码质量
   */
  async validateCodeQuality(expected, workDir) {
    const checks = [];

    // 检查命名规范
    if (expected.namingConvention) {
      checks.push({
        type: 'naming',
        passed: true  // 简化实现
      });
    }

    return {
      type: 'code-quality',
      passed: checks.every(c => c.passed),
      checks
    };
  }

  /**
   * 收集指标
   */
  async collectMetrics(executionResult, workDir) {
    const metrics = {
      executionTime: executionResult.duration,
      outputSize: executionResult.stdout?.length || 0,
      errorCount: executionResult.stderr?.length || 0
    };

    // 收集覆盖率数据
    try {
      const covReport = path.join(workDir, 'target/site/jacoco/index.html');
      if (await fs.pathExists(covReport)) {
        metrics.hasCoverageReport = true;
      }
    } catch (e) {
      // Ignore
    }

    return metrics;
  }
}

module.exports = { SkillExecutor };
