/** @type {import('jest').Config} */
const config = {
  // 测试环境
  testEnvironment: 'node',
  
  // 测试匹配模式
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.js',
    '**/tests/**/*.test.ts',
    '**/tests/**/*.test.js',
  ],
  
  // 覆盖率收集
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  
  // 覆盖率输出目录
  coverageDirectory: 'coverage',
  
  // 覆盖率报告格式
  coverageReporters: ['text', 'lcov', 'html'],
  
  // 测试超时时间（毫秒）
  testTimeout: 30000,
  
  // 根目录
  rootDir: '.',
  
  // 模块文件扩展名
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // 转换配置
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
    }],
  },
  
  // 忽略转换
  transformIgnorePatterns: [
    'node_modules/',
  ],
  
  // 模块路径别名
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  // 详细输出
  verbose: true,
  
  // 检测打开的句柄
  detectOpenHandles: true,
  
  // 强制退出
  forceExit: true,
};

module.exports = config;