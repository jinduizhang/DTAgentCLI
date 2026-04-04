#!/usr/bin/env node
/**
 * DTAgent 工作空间隔离测试脚本
 * 
 * 测试内容：
 * 1. dtagent init 后插件和 core 模块是否正确安装
 * 2. workspace-manager.ts 是否包含新代码（mainLink、cleanupOldSlots 等）
 * 3. 二次执行时的清理逻辑
 * 
 * 用法：node test-workspace-isolation.js <项目路径>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'blue');
  console.log('='.repeat(60));
}

function logTest(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  const color = passed ? 'green' : 'red';
  console.log(`  ${icon} ${name}`, passed ? colors.green : colors.red);
  if (details) {
    console.log(`     ${details}`);
  }
}

// 测试结果统计
let passed = 0;
let failed = 0;

function recordTest(name, isPassed, details = '') {
  if (isPassed) {
    passed++;
    logTest(name, true, details);
  } else {
    failed++;
    logTest(name, false, details);
  }
  return isPassed;
}

// 获取项目路径（默认使用 config-history 测试项目）
const projectPath = process.env.TEST_PROJECT_PATH || 
                    path.resolve(__dirname, '..', '..', '..', 'config-history');
log(`\n测试项目: ${projectPath}`, 'cyan');

// ==================== 测试 1: dtagent init 后的文件检查 ====================
logSection('测试 1: dtagent init 后的文件检查');

const opencodeDir = path.join(projectPath, '.opencode');

// 1.1 检查 .opencode 目录是否存在
recordTest(
  '.opencode 目录存在',
  fs.existsSync(opencodeDir),
  `路径: ${opencodeDir}`
);

// 1.2 检查插件文件
const pluginPath = path.join(opencodeDir, 'plugins', 'task-manager.ts');
recordTest(
  'task-manager.ts 插件存在',
  fs.existsSync(pluginPath),
  `路径: ${pluginPath}`
);

// 1.3 检查 core 模块
const corePath = path.join(opencodeDir, 'core', 'workspace-manager.ts');
recordTest(
  'workspace-manager.ts 核心模块存在',
  fs.existsSync(corePath),
  `路径: ${corePath}`
);

// 1.4 检查其他必要文件
const agentPath = path.join(opencodeDir, 'agents', 'dtagent.md');
recordTest(
  'dtagent.md 代理配置存在',
  fs.existsSync(agentPath),
  `路径: ${agentPath}`
);

const opencodeJsonPath = path.join(projectPath, 'opencode.json');
recordTest(
  'opencode.json 配置文件存在',
  fs.existsSync(opencodeJsonPath),
  `路径: ${opencodeJsonPath}`
);

// ==================== 测试 2: workspace-manager.ts 代码检查 ====================
logSection('测试 2: workspace-manager.ts 新代码检查');

if (fs.existsSync(corePath)) {
  const content = fs.readFileSync(corePath, 'utf-8');
  
  // 2.1 检查 mainLink（修复后的字段）
  recordTest(
    '包含 mainLink 字段（修复后的软链接结构）',
    content.includes('mainLink'),
    content.includes('mainLink') ? 
      `找到: ${content.match(/mainLink.*?:/)?.[0] || ''}` : 
      '未找到 mainLink，可能仍是旧版本'
  );
  
  // 2.2 检查 cleanupOldSlots（清理旧槽位）
  recordTest(
    '包含 cleanupOldSlots 方法（清理旧槽位）',
    content.includes('cleanupOldSlots'),
    content.includes('cleanupOldSlots') ? 
      `找到: cleanupOldSlots()` : 
      '未找到 cleanupOldSlots，二次执行时可能残留旧槽位'
  );
  
  // 2.3 检查 initLogger（日志系统）
  recordTest(
    '包含 initLogger 方法（日志系统）',
    content.includes('initLogger'),
    content.includes('initLogger') ? 
      '找到: initLogger()' : 
      '未找到 initLogger，日志可能打印到 GUI'
  );
  
  // 2.4 检查 resetSlot 是否清空 src/test
  const hasResetSlot = content.includes('resetSlot');
  const clearsTestPath = hasResetSlot && content.includes('slot.testPath');
  recordTest(
    'resetSlot 清空 src/test 目录',
    clearsTestPath,
    clearsTestPath ? 
      'resetSlot 会清空 src/test/java' : 
      'resetSlot 未清空 src/test，测试文件可能残留'
  );
  
  // 2.5 检查 copyTestFiles
  recordTest(
    '包含 copyTestFiles 方法（复制测试文件）',
    content.includes('copyTestFiles'),
    content.includes('copyTestFiles') ? 
      '找到: copyTestFiles()' : 
      '未找到 copyTestFiles，测试文件无法复制到原项目'
  );
  
  // 2.6 检查 createSlot 中的独立 src/test 目录
  const hasTestPathAssign = content.match(/testPath\s*=\s*path\.join/);
  const hasTestPathMkdir = content.match(/fs\.mkdirSync\(testPath/);
  recordTest(
    'createSlot 创建独立的 src/test 目录',
    hasTestPathAssign && hasTestPathMkdir,
    `testPath 赋值: ${hasTestPathAssign ? '✓' : '✗'}, mkdir: ${hasTestPathMkdir ? '✓' : '✗'}`
  );
} else {
  log('  ⚠️  workspace-manager.ts 不存在，跳过代码检查', 'yellow');
}

// ==================== 测试 3: task-manager.ts 代码检查 ====================
logSection('测试 3: task-manager.ts 插件集成检查');

if (fs.existsSync(pluginPath)) {
  const content = fs.readFileSync(pluginPath, 'utf-8');
  
  // 3.1 检查导入 workspace-manager
  recordTest(
    '导入 WorkspacePool',
    content.includes('WorkspacePool') || content.includes('workspace-manager'),
    'task-manager 应该导入 workspace-manager'
  );
  
  // 3.2 检查 copyTestFiles 调用
  recordTest(
    '调用 copyTestFiles 复制测试文件',
    content.includes('copyTestFiles'),
    content.includes('copyTestFiles') ? 
      '任务完成后会复制测试文件' : 
      '测试文件不会被复制到原项目'
  );
  
  // 3.3 检查 batchSize 控制
  recordTest(
    '支持 batchSize 参数控制并行度',
    content.includes('batchSize') || content.includes('batch-size'),
    '应该支持 batchSize 参数'
  );
  
  // 3.4 检查工作空间池初始化
  recordTest(
    '初始化工作空间池',
    content.includes('createWorkspacePool') || content.includes('new WorkspacePool'),
    '应该在 task-start 时初始化工作空间池'
  );
  
  // 3.5 检查槽位获取和释放
  const hasAcquire = content.includes('acquireSlot');
  const hasRelease = content.includes('releaseSlot');
  recordTest(
    '槽位获取和释放逻辑',
    hasAcquire && hasRelease,
    `acquireSlot: ${hasAcquire ? '✓' : '✗'}, releaseSlot: ${hasRelease ? '✓' : '✗'}`
  );
} else {
  log('  ⚠️  task-manager.ts 不存在，跳过插件检查', 'yellow');
}

// ==================== 测试 4: 模拟二次执行清理 ====================
logSection('测试 4: 模拟二次执行清理逻辑');

const workspacePoolDir = path.join(projectPath, '.dtagent', 'workspace-pool');
const logDir = path.join(projectPath, '.dtagent', 'log');
const logPath = path.join(logDir, 'dtagent.log');

// 4.1 检查旧槽位是否存在
if (fs.existsSync(workspacePoolDir)) {
  const slots = fs.readdirSync(workspacePoolDir).filter(d => d.startsWith('slot-'));
  log(`  发现 ${slots.length} 个现有槽位: ${slots.join(', ')}`, 'cyan');
  
  // 检查槽位结构
  slots.forEach(slotName => {
    const slotPath = path.join(workspacePoolDir, slotName);
    const srcPath = path.join(slotPath, 'src');
    
    // 检查 src 是否是软链接还是独立目录
    if (fs.existsSync(srcPath)) {
      const isSymlink = fs.lstatSync(srcPath).isSymbolicLink();
      const mainPath = path.join(srcPath, 'main');
      const testPath = path.join(srcPath, 'test');
      
      if (isSymlink) {
        log(`  ⚠️  ${slotName}/src 是软链接（旧版本）`, 'yellow');
        recordTest(`${slotName} src 是独立目录（非软链接）`, false, '应该是独立目录');
      } else {
        const hasMain = fs.existsSync(mainPath);
        const hasTest = fs.existsSync(testPath);
        recordTest(
          `${slotName} 结构正确`,
          hasMain && hasTest,
          `main: ${hasMain ? '✓' : '✗'}, test: ${hasTest ? '✓' : '✗'}`
        );
      }
    }
  });
  
  log(`  💡 提示: 删除槽位目录以测试清理逻辑`, 'cyan');
  log(`     rm -rf "${workspacePoolDir}"`, 'cyan');
} else {
  log('  ✓ 无现有槽位，可以测试初始化流程', 'green');
}

// 4.2 检查日志文件
if (fs.existsSync(logPath)) {
  const logContent = fs.readFileSync(logPath, 'utf-8');
  const lines = logContent.split('\n').filter(l => l.trim());
  
  log(`  日志文件存在，共 ${lines.length} 行`, 'cyan');
  
  // 检查清理日志（如果没有清理记录，只是警告）
  const hasCleanupLog = logContent.includes('清理') || logContent.includes('cleanup');
  if (!hasCleanupLog) {
    log('  ⚠️  日志中没有清理记录（可能未执行过清理操作）', 'yellow');
  }
  // 不计入失败，因为首次运行时没有清理操作是正常的
  
  // 检查初始化日志
  const hasInitLog = logContent.includes('初始化');
  recordTest(
    '日志包含初始化记录',
    hasInitLog,
    hasInitLog ? '找到初始化日志' : '未找到初始化日志'
  );
  
  // 显示最近的日志
  console.log('\n  最近日志（最后 10 行）:');
  lines.slice(-10).forEach(line => {
    console.log(`    ${line}`);
  });
} else {
  log('  ⚠️  日志文件不存在，可能未执行过任务', 'yellow');
}

// ==================== 测试 5: 源文件与安装文件对比 ====================
logSection('测试 5: 源文件与安装文件对比');

const srcWorkspaceManager = path.join(__dirname, '..', 'src', 'core', 'workspace-manager.ts');
const templatesWorkspaceManager = path.join(__dirname, '..', 'templates', 'core', 'workspace-manager.ts');

// 5.1 对比 src 和 templates 版本
if (fs.existsSync(srcWorkspaceManager) && fs.existsSync(templatesWorkspaceManager)) {
  const srcContent = fs.readFileSync(srcWorkspaceManager, 'utf-8');
  const templatesContent = fs.readFileSync(templatesWorkspaceManager, 'utf-8');
  
  const srcLines = srcContent.split('\n').length;
  const templatesLines = templatesContent.split('\n').length;
  
  recordTest(
    'src 和 templates 文件同步',
    srcLines === templatesLines,
    `src: ${srcLines} 行, templates: ${templatesLines} 行`
  );
  
  // 检查关键代码是否一致
  const keyMethods = ['mainLink', 'cleanupOldSlots', 'initLogger', 'resetSlot'];
  keyMethods.forEach(method => {
    const srcHas = srcContent.includes(method);
    const templatesHas = templatesContent.includes(method);
    recordTest(
      `templates 包含 ${method}`,
      templatesHas,
      `src: ${srcHas ? '✓' : '✗'}, templates: ${templatesHas ? '✓' : '✗'}`
    );
  });
}

// 5.2 对比安装的文件
if (fs.existsSync(corePath) && fs.existsSync(templatesWorkspaceManager)) {
  const installedContent = fs.readFileSync(corePath, 'utf-8');
  const templatesContent = fs.readFileSync(templatesWorkspaceManager, 'utf-8');
  
  const installedLines = installedContent.split('\n').length;
  const templatesLines = templatesContent.split('\n').length;
  
  recordTest(
    '.opencode 中的文件与 templates 同步',
    installedLines === templatesLines,
    `.opencode: ${installedLines} 行, templates: ${templatesLines} 行`
  );
  
  if (installedLines !== templatesLines) {
    log(`  💡 提示: 运行 dtagent init --force 更新安装的文件`, 'cyan');
  }
}

// ==================== 总结 ====================
logSection('测试总结');

console.log(`\n  通过: ${passed} 个`);
console.log(`  失败: ${failed} 个`);
console.log(`  总计: ${passed + failed} 个`);

if (failed === 0) {
  log('\n  🎉 所有测试通过！工作空间隔离已正确配置。', 'green');
  process.exit(0);
} else {
  log('\n  ⚠️  存在失败的测试，请检查上述详情。', 'yellow');
  
  console.log('\n  修复建议:');
  if (!fs.existsSync(corePath)) {
    console.log('  1. 运行 dtagent init 安装组件');
  }
  console.log('  2. 运行 dtagent init --force 更新组件');
  console.log('  3. 检查 templates/core/workspace-manager.ts 是否最新');
  console.log('  4. 删除旧槽位: rm -rf .dtagent/workspace-pool');
  
  process.exit(1);
}