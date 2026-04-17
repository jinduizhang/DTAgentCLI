const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');
const glob = require('glob');

/**
 * 测试用例加载器
 * 从 YAML 文件加载测试用例
 */
class TestLoader {
  /**
   * 加载所有测试用例
   */
  static async loadAll(options = {}) {
    const { skills, priority, exclude } = options;
    
    const testCasesDir = path.join(__dirname, '../../test-cases');
    const pattern = path.join(testCasesDir, '**/*.yaml');
    
    const files = glob.sync(pattern, { ignore: exclude });
    
    const testCases = [];
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const testCase = yaml.parse(content);
        
        // 过滤
        if (this.shouldInclude(testCase, { skills, priority })) {
          testCases.push({
            ...testCase,
            _file: file
          });
        }
      } catch (error) {
        console.warn(`Failed to load ${file}:`, error.message);
      }
    }
    
    // 排序：P0 > P1 > P2 > P3
    testCases.sort((a, b) => {
      const priorityOrder = { 'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    return testCases;
  }

  /**
   * 按 Skill 加载
   */
  static async loadBySkill(skillName) {
    const skillDir = path.join(__dirname, '../../test-cases', skillName);
    
    if (!(await fs.pathExists(skillDir))) {
      throw new Error(`Skill directory not found: ${skillName}`);
    }
    
    const pattern = path.join(skillDir, '**/*.yaml');
    const files = glob.sync(pattern);
    
    const testCases = [];
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const testCase = yaml.parse(content);
        testCases.push({
          ...testCase,
          _file: file
        });
      } catch (error) {
        console.warn(`Failed to load ${file}:`, error.message);
      }
    }
    
    return testCases;
  }

  /**
   * 按 ID 加载
   */
  static async loadById(caseId) {
    const testCasesDir = path.join(__dirname, '../../test-cases');
    const pattern = path.join(testCasesDir, '**/*.yaml');
    
    const files = glob.sync(pattern);
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const testCase = yaml.parse(content);
        
        if (testCase.id === caseId) {
          return {
            ...testCase,
            _file: file
          };
        }
      } catch (error) {
        console.warn(`Failed to load ${file}:`, error.message);
      }
    }
    
    throw new Error(`Test case not found: ${caseId}`);
  }

  /**
   * 从 Markdown 加载（用于 README 中的用例定义）
   */
  static async loadFromMarkdown(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    
    // 提取 YAML 代码块
    const yamlBlocks = content.match(/```yaml\n([\s\S]*?)```/g);
    
    if (!yamlBlocks) {
      return [];
    }
    
    const testCases = [];
    
    for (const block of yamlBlocks) {
      const yamlContent = block.replace(/```yaml\n/, '').replace(/```$/, '');
      
      try {
        const testCase = yaml.parse(yamlContent);
        testCases.push(testCase);
      } catch (error) {
        console.warn('Failed to parse YAML block:', error.message);
      }
    }
    
    return testCases;
  }

  /**
   * 过滤条件
   */
  static shouldInclude(testCase, filters) {
    const { skills, priority } = filters;
    
    if (skills && !skills.includes(testCase.skill)) {
      return false;
    }
    
    if (priority && !priority.includes(testCase.priority)) {
      return false;
    }
    
    return true;
  }

  /**
   * 验证测试用例格式
   */
  static validate(testCase) {
    const required = ['id', 'name', 'description', 'expected'];
    
    for (const field of required) {
      if (!testCase[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // 验证 ID 格式
    if (!/^TC-[A-Z]+-\d+$/.test(testCase.id)) {
      throw new Error(`Invalid test case ID format: ${testCase.id}`);
    }
    
    return true;
  }
}

module.exports = { TestLoader };
