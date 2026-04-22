/**
 * Bare Repo Worktree 集成模块
 * 
 * 为 TaskManager 插件提供 Bare Repo 执行模式
 */

import { BareRepoOrchestrator, FileResult, WorktreeConfig, ResultMerger } from './index';
import * as path from 'path';

/**
 * Bare Repo 执行器
 * 
 * 封装 BareRepoOrchestrator 的使用，简化 TaskManager 集成
 */
export class BareRepoExecutor {
  private orchestrator: BareRepoOrchestrator | null = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * 判断是否应使用 Bare Repo 模式
   */
  shouldUseBareRepo(fileCount: number, batchSize: number): boolean {
    // 条件：batchSize > 1 且文件数 > batchSize
    return batchSize > 1 && fileCount > batchSize;
  }

  /**
   * 初始化 Orchestrator
   */
  initialize(batchSize: number): BareRepoOrchestrator {
    if (!this.orchestrator) {
      this.orchestrator = new BareRepoOrchestrator({
        projectRoot: this.projectRoot,
        batchSize,
        groupingStrategy: 'round-robin',
        autoCleanup: true,
        timeout: 300000 // 5分钟
      });
    }
    return this.orchestrator;
  }

  /**
   * 执行并行任务
   * 
   * @param files 文件列表
   * @param batchSize 并行组数
   * @param executeFileFn 执行单个文件的函数
   * @returns 执行结果
   */
  async execute(
    files: string[],
    batchSize: number,
    executeFileFn: (file: string, worktree: WorktreeConfig) => Promise<FileResult>
  ): Promise<{
    success: boolean;
    results: FileResult[];
    report: string;
    error?: string;
  }> {
    try {
      const orchestrator = this.initialize(batchSize);
      
      const groupResults = await orchestrator.execute(files, executeFileFn);
      
      const merged = ResultMerger.merge(groupResults);
      
      // 保存报告
      const reportPath = path.join(
        this.projectRoot, 
        '.dtagent', 
        'reports', 
        `bare-repo-execution-${Date.now()}.md`
      );
      ResultMerger.saveReport(merged.report, reportPath);
      
      return {
        success: merged.allSuccess,
        results: merged.allResults,
        report: merged.report
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        results: [],
        report: '',
        error: errorMessage
      };
    }
  }

  /**
   * 停止执行并清理
   */
  async stop(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.stop();
      this.orchestrator = null;
    }
  }

  /**
   * 获取执行状态
   */
  getStatus() {
    if (!this.orchestrator) {
      return null;
    }
    return this.orchestrator.getStatus();
  }
}

/**
 * 创建用于 TaskManager 的文件执行函数
 * 
 * @param client OpenCode client
 * @param directory 项目目录
 * @param promptBuilder 构建 prompt 的函数
 */
export function createFileExecutor(
  client: any,
  directory: string,
  promptBuilder: (file: string) => string
): (file: string, worktree: WorktreeConfig) => Promise<FileResult> {
  
  return async (file: string, worktree: WorktreeConfig): Promise<FileResult> => {
    const startTime = Date.now();
    
    try {
      // 构建 prompt，注入 worktree 信息
      const basePrompt = promptBuilder(file);
      const absolutePath = path.resolve(directory, file);
      
      const fullPrompt = `${basePrompt}

[Bare Repo Worktree 配置]
Worktree 路径: ${worktree.path}
Maven 本地仓库: ${worktree.m2Path}
执行 Maven 命令时请使用: -Dmaven.repo.local="${worktree.m2Path}"
`;
      
      const baseName = path.basename(file);
      
      // 创建 Session
      const session = await client.session.create({
        body: { title: baseName }
      });
      
      if (!session.data) {
        return {
          filename: file,
          success: false,
          error: '创建 Session 失败',
          duration: Date.now() - startTime
        };
      }
      
      const sessionId = session.data.id;
      
      // 发送 prompt
      await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: fullPrompt }]
        }
      });
      
      // 获取摘要
      const messages = await client.session.messages({ path: { id: sessionId } });
      let summary = '无结果';
      
      if (messages.data && messages.data.length > 0) {
        const lastMessage = messages.data[messages.data.length - 1];
        const parts = (lastMessage as any).parts || [];
        const textParts = parts
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('\n');
        summary = textParts.slice(0, 500) + (textParts.length > 500 ? '...' : '');
      }
      
      return {
        filename: file,
        success: true,
        sessionId,
        summary,
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        filename: file,
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime
      };
    }
  };
}