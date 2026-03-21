/**
 * Extract experience command - Extract mock patterns from existing test files
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';

export interface ExtractExperienceOptions {
  file?: string;
  dir?: string;
  save?: boolean;
}

interface MockPattern {
  name: string;
  type: string;
  pattern: string;
  template: string;
  notes: string[];
  source: string;
}

export async function extractExperienceCommand(options: ExtractExperienceOptions): Promise<void> {
  console.log(chalk.blue.bold('\n📝 DTAgent 提取 Mock 经验\n'));

  if (!options.file && !options.dir) {
    console.error(chalk.red('错误: 请指定 --file 或 --dir'));
    console.log(chalk.gray('\n用法:'));
    console.log(chalk.gray('  dtagent extract-experience --file src/test/java/ServiceTest.java'));
    console.log(chalk.gray('  dtagent extract-experience --dir src/test/java'));
    console.log(chalk.gray('  dtagent extract-experience --dir src/test/java --save'));
    process.exit(1);
  }

  const spinner = ora('正在提取 Mock 模式...').start();
  const projectDir = process.cwd();

  try {
    let patterns: MockPattern[] = [];

    if (options.file) {
      // Single file extraction
      const filePath = path.isAbsolute(options.file) 
        ? options.file 
        : path.resolve(projectDir, options.file);

      if (!fs.existsSync(filePath)) {
        spinner.fail(`文件不存在: ${filePath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      patterns = extractMockPatterns(content, path.basename(filePath));
    } else if (options.dir) {
      // Directory extraction
      const dirPath = path.isAbsolute(options.dir) 
        ? options.dir 
        : path.resolve(projectDir, options.dir);

      if (!fs.existsSync(dirPath)) {
        spinner.fail(`目录不存在: ${dirPath}`);
        process.exit(1);
      }

      const testFiles = findJavaTestFiles(dirPath);
      spinner.text = `正在扫描 ${testFiles.length} 个测试文件...`;

      for (const file of testFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const filePatterns = extractMockPatterns(content, path.basename(file));
        patterns.push(...filePatterns);
      }
    }

    // Deduplicate patterns by name
    patterns = deduplicatePatterns(patterns);

    spinner.succeed(`发现 ${patterns.length} 个 Mock 模式`);

    if (patterns.length === 0) {
      console.log(chalk.yellow('\n⚠️ 未在指定文件中找到 Mock 模式'));
      return;
    }

    // Display patterns
    console.log(chalk.green('\n📋 Mock 模式:\n'));
    patterns.forEach((p, i) => {
      console.log(chalk.white(`  ${i + 1}. ${p.name}`));
      console.log(chalk.gray(`     类型: ${p.type}`));
      console.log(chalk.gray(`     匹配: ${p.pattern}`));
      if (p.template) {
        console.log(chalk.gray(`     模板: ${p.template.split('\n')[0]}...`));
      }
      console.log();
    });

    // Save patterns if --save option
    if (options.save) {
      const savedCount = savePatternsToExperiences(projectDir, patterns);
      console.log(chalk.green(`\n✅ 已保存 ${savedCount} 个模式到 .opencode/skills/generate-java-ut/experiences/`));
      console.log(chalk.gray('   这些模式将在生成测试时自动匹配\n'));
    } else {
      // Suggest saving
      console.log(chalk.blue('\n💡 保存这些模式:'));
      console.log(chalk.gray('   dtagent extract-experience --dir src/test/java --save'));
      console.log(chalk.gray('   或手动添加到 .opencode/skills/generate-java-ut/experiences/\n'));
    }

  } catch (error) {
    spinner.fail('提取失败');
    console.error(chalk.red(`\n❌ 错误: ${error}`));
    process.exit(1);
  }
}

/**
 * Save patterns to experiences directory
 */
function savePatternsToExperiences(projectDir: string, patterns: MockPattern[]): number {
  const experiencesDir = path.join(
    projectDir, 
    '.opencode', 
    'skills', 
    'generate-java-ut', 
    'experiences'
  );

  // Create directory if not exists
  if (!fs.existsSync(experiencesDir)) {
    fs.mkdirSync(experiencesDir, { recursive: true });
  }

  let savedCount = 0;

  for (const pattern of patterns) {
    // Generate safe filename
    const safeName = pattern.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    const filePath = path.join(experiencesDir, `${safeName}.md`);

    // Skip if already exists
    if (fs.existsSync(filePath)) {
      continue;
    }

    // Generate experience file content
    const content = generateExperienceFile(pattern);
    fs.writeFileSync(filePath, content);
    savedCount++;
  }

  // Update DT_AGENTS.md if exists
  updateDtagentsFile(projectDir, patterns);

  return savedCount;
}

/**
 * Generate experience file content
 */
function generateExperienceFile(pattern: MockPattern): string {
  return `---
title: ${pattern.name}
type: ${pattern.type}
tags: [${pattern.pattern.toLowerCase()}, mock, extracted]
---

## 适用场景

从 ${pattern.source} 中自动提取的 Mock 模式。

## 代码示例

\`\`\`java
${pattern.template}
\`\`\`

## 注意事项

${pattern.notes.length > 0 ? pattern.notes.map(n => `- ${n}`).join('\n') : '- 无特殊注意事项'}

## 来源

自动提取自: ${pattern.source}
`;
}

/**
 * Update DT_AGENTS.md with new experiences
 */
function updateDtagentsFile(projectDir: string, patterns: MockPattern[]): void {
  const dtagentsPath = path.join(projectDir, 'DT_AGENTS.md');

  if (!fs.existsSync(dtagentsPath)) {
    return;
  }

  let content = fs.readFileSync(dtagentsPath, 'utf-8');

  // Check if Mock Experience section exists
  if (!content.includes('## Mock 经验库')) {
    content += '\n\n## Mock 经验库\n\n';
    content += '以下经验从测试代码中自动提取，会在生成测试时自动匹配应用。\n\n';
  }

  // Add new experiences
  let experienceSection = '';
  for (const pattern of patterns) {
    experienceSection += `### ${pattern.name}\n\n`;
    experienceSection += `**类型**: ${pattern.type}\n`;
    experienceSection += `**来源**: ${pattern.source}\n`;
    experienceSection += `**代码示例**:\n\`\`\`java\n${pattern.template}\n\`\`\`\n\n`;
  }

  // Insert before the last section
  const lastSectionIndex = content.lastIndexOf('\n---\n');
  if (lastSectionIndex > 0) {
    content = content.slice(0, lastSectionIndex) + '\n' + experienceSection + content.slice(lastSectionIndex);
  } else {
    content += experienceSection;
  }

  fs.writeFileSync(dtagentsPath, content);
}

/**
 * Find all Java test files in a directory
 */
function findJavaTestFiles(dir: string): string[] {
  const results: string[] = [];

  function scan(currentDir: string): void {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (item.endsWith('Test.java') || item.endsWith('Tests.java')) {
        results.push(fullPath);
      }
    }
  }

  scan(dir);
  return results;
}

/**
 * Extract mock patterns from test file content
 */
function extractMockPatterns(content: string, sourceFile: string): MockPattern[] {
  const patterns: MockPattern[] = [];

  // Extract @Mock patterns
  const mockPattern = /@Mock(?:Bean)?\s*(?:private\s+)?(?:static\s+)?(\w+)\s+(\w+)\s*;/g;
  let match;

  while ((match = mockPattern.exec(content)) !== null) {
    const className = match[1];
    const fieldName = match[2];

    patterns.push({
      name: `${className} Mock`,
      type: detectMockType(className),
      pattern: className,
      template: `@Mock\nprivate ${className} ${fieldName};`,
      notes: [],
      source: sourceFile,
    });
  }

  // Extract @InjectMocks patterns
  const injectMocksPattern = /@InjectMocks\s*(?:private\s+)?(\w+)\s+(\w+)\s*;/g;
  while ((match = injectMocksPattern.exec(content)) !== null) {
    const className = match[1];
    const fieldName = match[2];

    patterns.push({
      name: `${className} Injection`,
      type: 'Dependency Injection',
      pattern: className,
      template: `@InjectMocks\nprivate ${className} ${fieldName};`,
      notes: [],
      source: sourceFile,
    });
  }

  // Extract when().thenReturn() patterns
  const whenPattern = /when\((\w+)\.(\w+)\(([^)]*)\)\)\.thenReturn\(([^)]+)\)/g;
  while ((match = whenPattern.exec(content)) !== null) {
    const mockName = match[1];
    const method = match[2];
    const args = match[3];
    const returnValue = match[4];

    // Find the corresponding pattern and add the template
    const existingPattern = patterns.find(p => p.pattern === mockName);
    if (existingPattern) {
      existingPattern.template += `\nwhen(${mockName}.${method}(${args})).thenReturn(${returnValue});`;
    }
  }

  // Extract @SpringBootTest pattern
  if (content.includes('@SpringBootTest')) {
    patterns.push({
      name: 'Spring Boot Integration Test',
      type: 'Framework Config',
      pattern: 'SpringBootTest',
      template: '@SpringBootTest\nclass TestClass { }',
      notes: ['Use @MockBean instead of @Mock in Spring Boot tests'],
      source: sourceFile,
    });
  }

  // Extract @WebMvcTest pattern
  if (content.includes('@WebMvcTest')) {
    patterns.push({
      name: 'WebMvc Controller Test',
      type: 'Framework Config',
      pattern: 'WebMvcTest',
      template: '@WebMvcTest(controllers = {Controller.class})\n@AutoConfigureMockMvc\nclass TestClass {\n    @Autowired\n    private MockMvc mockMvc;\n}',
      notes: ['Use @MockBean for service mocks', 'Use MockMvc for HTTP testing'],
      source: sourceFile,
    });
  }

  // Extract MockMvc usage
  if (content.includes('MockMvc')) {
    patterns.push({
      name: 'MockMvc HTTP Testing',
      type: 'Test Utility',
      pattern: 'MockMvc',
      template: '@Autowired\nprivate MockMvc mockMvc;\n\nmockMvc.perform(post("/path"))\n    .andExpect(status().isOk())\n    .andExpect(jsonPath("$.code").value(200));',
      notes: ['Use mockMvc.perform() for HTTP requests', 'Use jsonPath() for JSON assertions'],
      source: sourceFile,
    });
  }

  // Extract @Autowired pattern
  const autowiredPattern = /@Autowired\s*(?:private\s+)?(\w+)\s+(\w+)\s*;/g;
  while ((match = autowiredPattern.exec(content)) !== null) {
    const className = match[1];
    const fieldName = match[2];

    // Skip MockMvc (already handled above)
    if (className === 'MockMvc') continue;

    patterns.push({
      name: `${className} Autowired`,
      type: 'Dependency Injection',
      pattern: className,
      template: `@Autowired\nprivate ${className} ${fieldName};`,
      notes: ['Spring Boot auto-wiring'],
      source: sourceFile,
    });
  }

  // Extract @ExtendWith patterns
  const extendWithPattern = /@ExtendWith\((\w+\.class)\)/g;
  while ((match = extendWithPattern.exec(content)) !== null) {
    const extensionClass = match[1];

    patterns.push({
      name: `${extensionClass.replace('.class', '')} Extension`,
      type: 'Test Config',
      pattern: extensionClass,
      template: `@ExtendWith(${extensionClass})`,
      notes: [],
      source: sourceFile,
    });
  }

  return patterns;
}

/**
 * Detect mock type based on class name
 */
function detectMockType(className: string): string {
  const internalLibraries = [
    'Diamond', 'Tair', 'HSF', 'Notify', 'ONS', 'MetaQ', 'DiamondClient',
    'Redis', 'Cache', 'MQ', 'ConfigCenter'
  ];

  const frameworks = [
    'Repository', 'Service', 'Controller', 'Mapper', 'Dao', 'Client'
  ];

  for (const lib of internalLibraries) {
    if (className.includes(lib)) {
      return '二方件Mock';
    }
  }

  for (const fw of frameworks) {
    if (className.includes(fw)) {
      return '框架组件Mock';
    }
  }

  return '依赖Mock';
}

/**
 * Deduplicate patterns by name
 */
function deduplicatePatterns(patterns: MockPattern[]): MockPattern[] {
  const seen = new Map<string, MockPattern>();

  for (const p of patterns) {
    if (!seen.has(p.name)) {
      seen.set(p.name, p);
    } else {
      // Merge templates
      const existing = seen.get(p.name)!;
      if (!existing.template.includes(p.template)) {
        existing.template += '\n' + p.template;
      }
    }
  }

  return Array.from(seen.values());
}