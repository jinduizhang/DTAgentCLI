import { WorktreeConfig, FileResult, GroupResult } from './types';

/**
 * 组执行器
 * 
 * 在单个 Worktree 内串行执行文件任务
 */
export class GroupExecutor {
  private worktree: WorktreeConfig;
  private files: string[];
  private currentIndex: number = 0;
  private results: FileResult[] = [];
  private startTime: number = 0;

  constructor(worktree: WorktreeConfig, files: string[]) {
    this.worktree = worktree;
    this.files = files;
  }

  /**
   * 执行组内所有文件任务（串行）
   */
  async execute(
    executeFileFn: (file: string, worktree: WorktreeConfig) => Promise<FileResult>
  ): Promise<GroupResult> {
    this.startTime = Date.now();
    this.currentIndex = 0;
    this.results = [];

    console.log(`[GroupExecutor] Starting group ${this.worktree.id} with ${this.files.length} files`);

    for (const file of this.files) {
      this.currentIndex++;
      console.log(`[GroupExecutor] Executing file ${this.currentIndex}/${this.files.length}: ${file}`);
      
      try {
        const result = await executeFileFn(file, this.worktree);
        this.results.push(result);
        
        if (!result.success) {
          console.error(`[GroupExecutor] File ${file} failed:`, result.error);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[GroupExecutor] Error executing ${file}:`, errorMessage);
        
        this.results.push({
          filename: file,
          success: false,
          error: errorMessage
        });
      }
    }

    const endTime = Date.now();
    const allSuccess = this.results.every(r => r.success);

    console.log(`[GroupExecutor] Group ${this.worktree.id} completed: ${this.results.filter(r => r.success).length}/${this.files.length} succeeded`);

    return {
      groupId: parseInt(this.worktree.id.split('-')[1]) || 0,
      worktreePath: this.worktree.path,
      fileResults: this.results,
      startTime: this.startTime,
      endTime: endTime,
      allSuccess
    };
  }

  /**
   * 获取当前进度
   */
  getProgress(): { current: number; total: number; currentFile?: string } {
    return {
      current: this.currentIndex,
      total: this.files.length,
      currentFile: this.files[this.currentIndex - 1]
    };
  }

  /**
   * 获取已执行的结果
   */
  getResults(): FileResult[] {
    return this.results;
  }
}