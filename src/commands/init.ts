/**
 * Init command - Initialize DTAgent in the current project
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { detectFramework, formatFrameworkInfo, FrameworkInfo } from '../utils/detector';

export interface InitOptions {
  dryRun?: boolean;
  force?: boolean;
  file?: string;  // 可选：指定 pom.xml 或 build.gradle 文件路径
}

interface MockExperience {
  name: string;
  pattern: string;
  template: string;
  notes: string[];
  source: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  console.log(chalk.blue.bold('\n🚀 DTAgent 初始化\n'));

  const spinner = ora('正在初始化 DTAgent...').start();
  let projectDir = process.cwd();

  try {
    // 如果指定了文件参数，使用文件所在目录作为项目目录
    if (options.file) {
      const filePath = path.isAbsolute(options.file) 
        ? options.file 
        : path.resolve(process.cwd(), options.file);
      
      if (!fs.existsSync(filePath)) {
        spinner.fail(`文件不存在: ${filePath}`);
        process.exit(1);
      }
      
      projectDir = path.dirname(filePath);
      console.log(chalk.gray(`  项目目录: ${projectDir}`));
    }

    // Step 1: Detect project framework
    spinner.text = '正在检测项目框架...';
    const framework = await detectFramework(projectDir);
    
    if (framework.type === 'unknown') {
      spinner.fail('不是 Java 项目（未找到 pom.xml 或 build.gradle）');
      process.exit(1);
    }
    
    console.log(chalk.gray('\n  ' + formatFrameworkInfo(framework).replace(/\n/g, '\n  ')));

    // Step 2: Install components
    if (!options.dryRun) {
      spinner.text = '正在安装组件...';
      await installComponents(projectDir, framework, options.force);
    } else {
      console.log(chalk.yellow('\n  [预览模式] 将安装组件到 .opencode/'));
    }

    // Step 3: Extract experiences
    spinner.text = '正在提取 Mock 经验...';
    const experiences = await extractExperiences(projectDir);
    console.log(chalk.gray(`  发现 ${experiences.length} 个 Mock 模式`));

    // Step 4: Generate configuration
    if (!options.dryRun) {
      spinner.text = '正在生成配置...';
      await generateConfig(projectDir, framework, experiences);
    } else {
      console.log(chalk.yellow('\n  [预览模式] 将生成 DT_AGENTS.md'));
    }

    spinner.succeed('DTAgent 初始化完成！');
    
    console.log(chalk.green('\n✅ 下一步操作:'));
    console.log(chalk.gray('   1. 运行 OpenCode（自动使用 DTAgent）'));
    console.log(chalk.gray('   2. 执行 /generate-dt-single <file> 生成测试'));
    console.log(chalk.gray('   3. 在 .opencode/skills/generate-java-ut/experiences/ 添加经验'));
    console.log(chalk.gray('\n📁 经验库位置:'));
    console.log(chalk.gray('   .opencode/skills/generate-java-ut/experiences/'));
    console.log(chalk.gray('   ├── README.md      # 使用说明'));
    console.log(chalk.gray('   ├── template.md    # 经验模板'));
    console.log(chalk.gray('   └── your-*.md      # 你的自定义经验'));
    console.log(chalk.gray('\n⚙️  默认代理: dtagent（已配置在 opencode.json）\n'));

  } catch (error) {
    spinner.fail('初始化失败');
    console.error(chalk.red(`\n❌ 错误: ${error}`));
    process.exit(1);
  }
}

/**
 * Install DTAgent components to project
 */
async function installComponents(
  projectDir: string, 
  framework: FrameworkInfo, 
  force?: boolean
): Promise<void> {
  const opencodeDir = path.join(projectDir, '.opencode');
  
  // Check if already initialized
  if (fs.existsSync(opencodeDir) && !force) {
    console.log(chalk.yellow('\n  .opencode/ 已存在，使用 --force 覆盖'));
    return;
  }

  // Create directory structure
  const dirs = [
    opencodeDir,
    path.join(opencodeDir, 'skills'),
    path.join(opencodeDir, 'skills', 'generate-java-ut'),
    path.join(opencodeDir, 'skills', 'generate-java-ut', 'experiences'),
    path.join(opencodeDir, 'skills', 'fix-java-ut'),
    path.join(opencodeDir, 'skills', 'java-coverage'),
    path.join(opencodeDir, 'skills', 'init-dt'),
    path.join(opencodeDir, 'skills', 'init-dt', 'experiences'),
    path.join(opencodeDir, 'plugins'),
    path.join(opencodeDir, 'agents'),
    path.join(opencodeDir, 'commands'),
    path.join(opencodeDir, 'iterations'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Get templates directory
  const templatesDir = getTemplatesDir();
  
  // Copy skills
  copySkill(path.join(templatesDir, 'skills', 'generate-java-ut'), 
            path.join(opencodeDir, 'skills', 'generate-java-ut'));
  copySkill(path.join(templatesDir, 'skills', 'fix-java-ut'), 
            path.join(opencodeDir, 'skills', 'fix-java-ut'));
  copySkill(path.join(templatesDir, 'skills', 'java-coverage'), 
            path.join(opencodeDir, 'skills', 'java-coverage'));
  copySkill(path.join(templatesDir, 'skills', 'init-dt'), 
            path.join(opencodeDir, 'skills', 'init-dt'));

  // Copy plugins
  const pluginSrc = path.join(templatesDir, 'plugins', 'task-manager.ts');
  const pluginDest = path.join(opencodeDir, 'plugins', 'task-manager.ts');
  if (fs.existsSync(pluginSrc)) {
    fs.copyFileSync(pluginSrc, pluginDest);
  }

  // Copy agents
  const agentSrc = path.join(templatesDir, 'agents', 'dtagent.md');
  const agentDest = path.join(opencodeDir, 'agents', 'dtagent.md');
  if (fs.existsSync(agentSrc)) {
    fs.copyFileSync(agentSrc, agentDest);
  }

  // Copy commands (OpenCode slash commands)
  copySkill(path.join(templatesDir, 'commands'), 
            path.join(opencodeDir, 'commands'));

  // Copy iterations (changelog and snapshots)
  copySkill(path.join(templatesDir, 'iterations'), 
            path.join(opencodeDir, 'iterations'));

  // Create package.json for .opencode
  createOpenCodePackageJson(opencodeDir);

  // Create opencode.json with default_agent
  createOpenCodeConfig(projectDir);

  console.log(chalk.green('\n  ✓ 组件已安装到 .opencode/'));
}

/**
 * Get templates directory path
 */
function getTemplatesDir(): string {
  // In development, templates are in project root
  // In production, they're bundled with the package
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'templates'),
    path.join(process.cwd(), 'templates'),
    path.resolve(__dirname, '../../../templates'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  throw new Error('Templates directory not found');
}

/**
 * Copy a skill directory
 */
function copySkill(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;

  const items = fs.readdirSync(src);
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.statSync(srcPath).isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copySkill(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Create package.json for .opencode directory
 */
function createOpenCodePackageJson(opencodeDir: string): void {
  const packageJsonPath = path.join(opencodeDir, 'package.json');
  
  if (fs.existsSync(packageJsonPath)) return;

  const packageJson = {
    name: 'opencode-project',
    version: '1.0.0',
    description: 'OpenCode project configuration',
    dependencies: {
      '@opencode-ai/plugin': '^1.2.27'
    }
  };

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

/**
 * Create opencode.json with default_agent configuration
 */
function createOpenCodeConfig(projectDir: string): void {
  const configPath = path.join(projectDir, 'opencode.json');
  
  // 如果已存在配置文件，不覆盖
  if (fs.existsSync(configPath)) {
    const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // 如果已有 default_agent 配置，不修改
    if (existingConfig.default_agent) {
      return;
    }
    // 添加 default_agent
    existingConfig.default_agent = 'dtagent';
    fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));
    return;
  }

  // 创建新的配置文件
  const config = {
    "$schema": "https://opencode.ai/config.json",
    "default_agent": "dtagent"
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // 添加到 .gitignore
  addToGitignore(projectDir, 'opencode.json');
}

/**
 * Add entry to .gitignore if not exists
 */
function addToGitignore(projectDir: string, entry: string): void {
  const gitignorePath = path.join(projectDir, '.gitignore');
  
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(entry)) {
      fs.appendFileSync(gitignorePath, `\n# DTAgent\n${entry}\n`);
    }
  } else {
    fs.writeFileSync(gitignorePath, `# DTAgent\n${entry}\n`);
  }
}

/**
 * Extract mock experiences from existing test files
 */
async function extractExperiences(projectDir: string): Promise<MockExperience[]> {
  const experiences: MockExperience[] = [];
  const testDir = path.join(projectDir, 'src', 'test', 'java');

  if (!fs.existsSync(testDir)) {
    return experiences;
  }

  // Find all Java test files
  const testFiles = findJavaFiles(testDir);

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const extracted = extractMockPatterns(content, file);
    experiences.push(...extracted);
  }

  return experiences;
}

/**
 * Find all Java files in a directory recursively
 */
function findJavaFiles(dir: string): string[] {
  const results: string[] = [];
  
  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...findJavaFiles(fullPath));
    } else if (item.endsWith('.java')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Extract mock patterns from test file content
 */
function extractMockPatterns(content: string, filePath: string): MockExperience[] {
  const experiences: MockExperience[] = [];

  // Match @Mock patterns
  const mockPattern = /@Mock(?:Bean)?\s*(?:private\s+)?(\w+)\s+(\w+)\s*;/g;
  let match;

  while ((match = mockPattern.exec(content)) !== null) {
    const className = match[1];
    const fieldName = match[2];

    // Check if we already have this pattern
    const existing = experiences.find(e => e.pattern.includes(className));
    if (!existing) {
      experiences.push({
        name: `${className} Mock`,
        pattern: className,
        template: `@Mock\nprivate ${className} ${fieldName};`,
        notes: [],
        source: path.basename(filePath),
      });
    }
  }

  // Match when().thenReturn() patterns
  const whenPattern = /when\((\w+)\.(\w+)\([^)]*\)\)\.thenReturn\(([^)]+)\)/g;
  while ((match = whenPattern.exec(content)) !== null) {
    const mockName = match[1];
    const method = match[2];
    const returnValue = match[3];

    const experience = experiences.find(e => e.name === `${mockName} Mock`);
    if (experience) {
      experience.template += `\nwhen(${mockName}.${method}()).thenReturn(${returnValue});`;
    }
  }

  return experiences;
}

/**
 * Generate DT_AGENTS.md configuration file
 */
async function generateConfig(
  projectDir: string, 
  framework: FrameworkInfo, 
  experiences: MockExperience[]
): Promise<void> {
  const configPath = path.join(projectDir, 'DT_AGENTS.md');
  const date = new Date().toISOString().split('T')[0];

  // 提取 Maven 配置
  const mavenConfig = extractMavenConfig(projectDir);
  
  // 构建自定义参数
  let customArgs = '';
  if (mavenConfig.settings) {
    customArgs += ` -s ${mavenConfig.settings}`;
  }
  if (mavenConfig.profiles) {
    customArgs += ` -P${mavenConfig.profiles}`;
  }
  if (mavenConfig.jvmArgs) {
    customArgs += ` ${mavenConfig.jvmArgs}`;
  }
  customArgs = customArgs.trim();

  const content = `# DT Agents 配置

**生成时间**: ${date}

## 测试框架

- JUnit: ${framework.junit || '未检测到'}
- Mockito: ${framework.mockito || '未检测到'}

## Maven 命令

\`\`\`bash
# 编译测试代码
mvn test-compile${customArgs ? ' ' + customArgs : ''}

# 运行单个测试
mvn test -Dtest={ClassName}${customArgs ? ' ' + customArgs : ''}

# 运行所有测试
mvn test${customArgs ? ' ' + customArgs : ''}

# 覆盖率报告
mvn jacoco:report${customArgs ? ' ' + customArgs : ''}
\`\`\`

## 测试用例规范

**必须使用 Given-When-Then 模式**：

\`\`\`java
@Test
@DisplayName("方法名_场景_预期结果")
void methodName_scenario_expectedResult() {
    // Given - 准备测试数据
    when(dependency.method()).thenReturn(value);
    
    // When - 执行被测方法
    var result = target.method(input);
    
    // Then - 验证结果
    assertThat(result).isEqualTo(expected);
    verify(dependency).method();
}
\`\`\`

## 命名规范

- 测试类: \`{ClassName}Test\`
- 测试方法: \`方法名_场景_预期结果\`
- 使用 \`@DisplayName\` 提供中文描述

---

*此文件由 dtagent init 自动生成*
`;

  fs.writeFileSync(configPath, content);
  console.log(chalk.green('  ✓ 已生成 DT_AGENTS.md'));
  
  if (mavenConfig.source) {
    console.log(chalk.gray(`  Maven 配置来源: ${mavenConfig.source}`));
  }
}

/**
 * Maven 配置信息
 */
interface MavenConfig {
  settings?: string;
  profiles?: string;
  jvmArgs?: string;
  source?: string;
}

/**
 * 从 .idea/workspace.xml 提取 Maven 配置
 */
function extractMavenConfig(projectDir: string): MavenConfig {
  const config: MavenConfig = {};
  
  // 尝试从 .idea/workspace.xml 提取
  const workspacePath = path.join(projectDir, '.idea', 'workspace.xml');
  
  if (fs.existsSync(workspacePath)) {
    try {
      const content = fs.readFileSync(workspacePath, 'utf-8');
      
      // 提取 settings 文件路径
      const settingsMatch = content.match(/myUserSettingsFile[^>]*value="([^"]+)"/);
      if (settingsMatch) {
        config.settings = settingsMatch[1];
      }
      
      // 提取 profiles
      const profilesMatch = content.match(/myProfiles[^>]*value="([^"]+)"/);
      if (profilesMatch) {
        config.profiles = profilesMatch[1];
      }
      
      // 提取 JVM 参数
      const jvmMatch = content.match(/myVmOptions[^>]*value="([^"]+)"/);
      if (jvmMatch) {
        config.jvmArgs = jvmMatch[1];
      }
      
      if (config.settings || config.profiles || config.jvmArgs) {
        config.source = '.idea/workspace.xml';
      }
    } catch (e) {
      // 读取失败，使用默认配置
    }
  }
  
  return config;
}