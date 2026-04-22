import { BareRepoInitializer } from './initializer';
import { WorktreePool } from './worktree-pool';
import { FileGrouper, GroupingStrategy } from './file-grouper';
import { GroupExecutor } from './group-executor';
import { ResultMerger } from './result-merger';
import { 
  ExecutionConfig, 
  GroupResult, 
  FileResult, 
  ExecutionStatus,
  GroupStatus,
  WorktreeConfig 
} from './types';

/**
 * Bare Repo 调度中心
 * 
 * 协调整个并行执行流程
 */
export class BareRepoOrchestrator {
  private config: ExecutionConfig;
  private initializer: BareRepoInitializer;
  private worktreePool: WorktreePool;
  private status: ExecutionStatus;
  private abortController: AbortController | null = null;

  constructor(config: ExecutionConfig) {
    this.config = config;
    this.initializer = new BareRepoInitializer(config.projectRoot);
    this.worktreePool = new WorktreePool(config.projectRoot);
    this.status = {
      state: 'idle',
      totalGroups: 0,
      completedGroups: 0,
      runningGroups: 0,
      failedGroups: 0,
      groupStatuses: []
    };
  }

  /**
   * 初始化 Bare Repo（如果不存在）
   */
  async initialize(): Promise<boolean> {
    if (this.initializer.isBareRepo()) {
      console.log('[Orchestrator] Bare repo already initialized');
      return true;
    }

    console.log('[Orchestrator] Initializing bare repository...');
    const result = await this.initializer.initialize();
    
    if (!result.success) {
      console.error('[Orchestrator] Failed to initialize bare repo:', result.error);
      return false;
    }

    console.log('[Orchestrator] Bare repository initialized successfully');
    return true;
  }

  /**
   * 将字符串策略转换为枚举
   */
  private getGroupingStrategy(strategy: string): GroupingStrategy {
    switch (strategy) {
      case 'round-robin':
        return GroupingStrategy.ROUND_ROBIN;
      case 'by-package':
        return GroupingStrategy.BY_PACKAGE;
      case 'by-complexity':
        return GroupingStrategy.BY_COMPLEXITY;
      default:
        return GroupingStrategy.ROUND_ROBIN;
    }
  }

  /**
   * 执行并行任务
   */
  async execute(
    files: string[],
    executeFileFn: (file: string, worktree: WorktreeConfig) => Promise<FileResult>
  ): Promise<GroupResult[]> {
    this.abortController = new AbortController();
    const results: GroupResult[] = [];

    try {
      // 1. 初始化 Bare Repo
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Failed to initialize bare repository');
      }

      // 2. 文件分组
      this.status.state = 'grouping';
      const strategy = this.getGroupingStrategy(this.config.groupingStrategy);
      const groups = FileGrouper.group(files, this.config.batchSize, strategy);
      this.status.totalGroups = groups.length;
      this.status.groupStatuses = groups.map((g, i) => ({
        groupId: i,
        status: 'pending',
        processedCount: 0,
        totalCount: g.files.length
      }));

      console.log(`[Orchestrator] Grouped ${files.length} files into ${groups.length} groups`);

      // 3. 创建 Worktree
      this.status.state = 'creating';
      for (let i = 0; i < groups.length; i++) {
        if (this.abortController.signal.aborted) {
          throw new Error('Execution aborted');
        }

        const worktree = await this.worktreePool.createGroupWorktree(i);
        groups[i].worktree = worktree;
        groups[i].id = i;
        
        this.status.groupStatuses[i].status = 'pending';
      }

      // 4. 并行执行所有组
      this.status.state = 'executing';
      const promises = groups.map(async (group) => {
        if (!group.worktree) {
          throw new Error(`Group ${group.id} has no worktree`);
        }

        this.status.groupStatuses[group.id].status = 'running';
        this.status.groupStatuses[group.id].startTime = Date.now();
        this.status.runningGroups++;

        const executor = new GroupExecutor(group.worktree, group.files);
        
        try {
          const result = await executor.execute(executeFileFn);
          results.push(result);
          
          this.status.groupStatuses[group.id].status = 'completed';
          this.status.completedGroups++;
          this.status.groupStatuses[group.id].processedCount = group.files.length;
          
          return result;
        } catch (error) {
          this.status.groupStatuses[group.id].status = 'failed';
          this.status.failedGroups++;
          throw error;
        } finally {
          this.status.runningGroups--;
        }
      });

      await Promise.all(promises);

      // 5. 合并结果
      this.status.state = 'merging';
      const merged = ResultMerger.merge(results);
      
      console.log(`[Orchestrator] Execution complete: ${merged.successCount}/${merged.totalFiles} succeeded`);

      // 6. 清理（如果配置为自动清理）
      if (this.config.autoCleanup) {
        this.status.state = 'cleaning';
        await this.worktreePool.destroyAll();
      }

      this.status.state = 'completed';
      return results;

    } catch (error) {
      console.error('[Orchestrator] Execution failed:', error);
      
      // 发生错误时强制清理
      try {
        await this.worktreePool.destroyAll();
      } catch (cleanupError) {
        console.error('[Orchestrator] Cleanup failed:', cleanupError);
      }
      
      throw error;
    }
  }

  /**
   * 停止执行
   */
  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    
    // 清理所有 Worktree
    await this.worktreePool.destroyAll();
    
    console.log('[Orchestrator] Execution stopped and cleaned up');
  }

  /**
   * 获取执行状态
   */
  getStatus(): ExecutionStatus {
    return { ...this.status };
  }

  /**
   * 获取 Bare Repo 信息
   */
  getBareRepoInfo() {
    return this.initializer.getInfo();
  }
}