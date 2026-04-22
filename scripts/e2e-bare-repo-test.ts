/**
 * Bare Repo Worktree E2E 测试脚本
 * 
 * 使用 config-history 项目验证 BareRepoInitializer 和 BareRepoOrchestrator
 */

import { BareRepoInitializer, BareRepoOrchestrator, WorktreeConfig, FileResult } from '../src/core/bare-repo';

const CONFIG_HISTORY_PATH = 'D:/OpenCode/config-history';

// 测试 Java 文件列表（config-history 项目）
const TEST_FILES = [
  'src/main/java/com/example/config/controller/ConfigController.java',
  'src/main/java/com/example/config/service/ConfigService.java',
  'src/main/java/com/example/config/service/impl/ConfigServiceImpl.java',
  'src/main/java/com/example/config/entity/ConfigItem.java',
  'src/main/java/com/example/config/entity/ConfigHistory.java',
];

async function testBareRepoInitializer() {
  console.log('\n========================================');
  console.log('Phase 1: BareRepoInitializer 测试');
  console.log('========================================\n');

  const initializer = new BareRepoInitializer(CONFIG_HISTORY_PATH);

  // 1. 检查当前状态
  console.log('1. 检查是否已是 Bare Repo:', initializer.isBareRepo());

  // 2. 验证
  const validation = initializer.validate();
  console.log('2. 验证结果:', validation);

  if (!validation.valid) {
    console.error('❌ 验证失败:', validation.reason);
    return false;
  }

  // 3. 执行初始化
  console.log('3. 开始初始化 Bare Repo...');
  const result = await initializer.initialize();
  
  if (result.success) {
    console.log('✅ 初始化成功!');
    console.log('   - barePath:', result.barePath);
    console.log('   - mainWorktreePath:', result.mainWorktreePath);
    return true;
  } else {
    console.error('❌ 初始化失败:', result.error);
    return false;
  }
}

async function testBareRepoOrchestrator() {
  console.log('\n========================================');
  console.log('Phase 2: BareRepoOrchestrator 测试');
  console.log('========================================\n');

  const config = {
    projectRoot: CONFIG_HISTORY_PATH,
    batchSize: 2,
    groupingStrategy: 'round-robin' as const,
    autoCleanup: true,
    timeout: 60000
  };

  const orchestrator = new BareRepoOrchestrator(config);

  // 模拟执行函数
  const mockExecuteFn = async (file: string, worktree: WorktreeConfig): Promise<FileResult> => {
    console.log(`   [Mock] Processing ${file} in worktree ${worktree.id}`);
    // 模拟处理时间
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      filename: file,
      success: true,
      duration: 100
    };
  };

  console.log('1. 开始执行并行任务...');
  console.log('   - 文件数量:', TEST_FILES.length);
  console.log('   - batchSize:', config.batchSize);

  const startTime = Date.now();
  
  try {
    const results = await orchestrator.execute(TEST_FILES, mockExecuteFn);
    const duration = Date.now() - startTime;

    console.log('\n✅ 执行成功!');
    console.log('   - 执行时间:', duration, 'ms');
    console.log('   - 组数量:', results.length);

    results.forEach((group, i) => {
      console.log(`   - Group ${i}: ${group.fileResults.length} files, allSuccess=${group.allSuccess}`);
    });

    // 显示最终状态
    const status = orchestrator.getStatus();
    console.log('\n   最终状态:', status.state);
    console.log('   - 总组数:', status.totalGroups);
    console.log('   - 完成组数:', status.completedGroups);

    return true;
  } catch (error) {
    console.error('❌ 执行失败:', error);
    return false;
  }
}

async function cleanup() {
  console.log('\n========================================');
  console.log('Phase 3: 清理验证');
  console.log('========================================\n');

  // 检查是否有残留的 worktree
  const { execSync } = require('child_process');
  
  try {
    const worktreeList = execSync('git worktree list', {
      cwd: CONFIG_HISTORY_PATH,
      encoding: 'utf8'
    });
    console.log('Worktree 列表:\n', worktreeList);
  } catch (error) {
    console.log('无法获取 worktree 列表');
  }
}

async function main() {
  console.log('========================================');
  console.log('Bare Repo Worktree E2E 测试');
  console.log('========================================');
  console.log('项目路径:', CONFIG_HISTORY_PATH);
  console.log('测试文件数量:', TEST_FILES.length);

  try {
    // Phase 1: 初始化测试
    const initSuccess = await testBareRepoInitializer();
    if (!initSuccess) {
      console.log('\n❌ E2E 测试失败: 初始化阶段');
      return;
    }

    // Phase 2: Orchestrator 测试
    const execSuccess = await testBareRepoOrchestrator();
    if (!execSuccess) {
      console.log('\n❌ E2E 测试失败: 执行阶段');
      return;
    }

    // Phase 3: 清理验证
    await cleanup();

    console.log('\n========================================');
    console.log('✅ E2E 测试全部通过!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ E2E 测试异常:', error);
  }
}

main();