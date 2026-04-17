const fs = require('fs-extra');
const path = require('path');

/**
 * 配置管理器
 * 加载和管理测评配置
 */
class ConfigManager {
  /**
   * 加载配置
   */
  static load(configPath) {
    const defaultConfig = this.getDefaultConfig();
    
    if (!configPath) {
      // 尝试查找默认配置文件
      const possiblePaths = [
        './evals/config.json',
        './evals/config.yaml',
        './config.json'
      ];
      
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          configPath = p;
          break;
        }
      }
    }
    
    if (configPath && fs.existsSync(configPath)) {
      const userConfig = this.loadFile(configPath);
      return this.merge(defaultConfig, userConfig);
    }
    
    return defaultConfig;
  }

  /**
   * 加载文件
   */
  static loadFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (filePath.endsWith('.json')) {
      return JSON.parse(content);
    } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      const yaml = require('yaml');
      return yaml.parse(content);
    }
    
    throw new Error(`Unsupported config format: ${filePath}`);
  }

  /**
   * 获取默认配置
   */
  static getDefaultConfig() {
    return {
      // 并行度
      parallelism: 4,
      
      // 超时配置（毫秒）
      timeout: {
        default: 180000,
        'init-dt': 60000,
        'generate-java-ut': 300000,
        'fix-java-ut': 300000,
        'java-coverage': 300000,
        'cwd-ut-protection': 300000
      },
      
      // 重试次数
      retries: 3,
      
      // 阈值配置
      thresholds: {
        overall: 80,
        'init-dt': 85,
        'generate-java-ut': 90,
        'fix-java-ut': 85,
        'java-coverage': 80,
        'cwd-ut-protection': 75
      },
      
      // 指标权重
      metricWeights: {
        passRate: 0.4,
        performance: 0.3,
        stability: 0.3
      },
      
      // 输出配置
      output: {
        directory: './evals/reports',
        formats: ['html', 'json', 'markdown']
      },
      
      // 对比配置
      comparison: {
        enabled: true,
        baselinePath: './evals/fixtures/expected-results'
      },
      
      // 日志级别
      logLevel: 'info',
      
      // 工作目录
      workspaceDir: './evals/workspaces',
      
      // 是否清理工作目录
      cleanup: true
    };
  }

  /**
   * 合并配置
   */
  static merge(defaults, user) {
    const merged = { ...defaults };
    
    for (const [key, value] of Object.entries(user)) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = this.merge(defaults[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  /**
   * 验证配置
   */
  static validate(config) {
    const required = ['parallelism', 'timeout', 'thresholds'];
    
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required config field: ${field}`);
      }
    }
    
    // 验证超时值为数字
    if (typeof config.timeout !== 'object') {
      throw new Error('timeout must be an object');
    }
    
    // 验证阈值
    if (typeof config.thresholds !== 'object') {
      throw new Error('thresholds must be an object');
    }
    
    return true;
  }

  /**
   * 保存配置
   */
  static async save(config, filePath) {
    await fs.ensureDir(path.dirname(filePath));
    
    if (filePath.endsWith('.json')) {
      await fs.writeFile(filePath, JSON.stringify(config, null, 2));
    } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      const yaml = require('yaml');
      await fs.writeFile(filePath, yaml.stringify(config));
    }
  }
}

module.exports = { ConfigManager };
