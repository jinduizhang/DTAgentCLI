import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { WorktreeConfig } from './types';

/**
 * Worktree 池管理器
 * 
 * 管理动态 Worktree 的创建、使用和销毁
 */
export class WorktreePool {
  private projectRoot: string;
  private barePath: string;
  private worktreesDir: string;
  private worktrees: Map<string, WorktreeConfig> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.barePath = path.join(projectRoot, '.bare');
    this.worktreesDir = path.join(projectRoot, '.dtagent', 'worktrees');
  }

  /**
   * 为文件组创建 Worktree
   */
  async createGroupWorktree(groupId: number): Promise<WorktreeConfig> {
    const timestamp = Date.now();
    const branchName = `agent-group-${groupId}-${timestamp}`;
    const worktreeName = `group-${groupId}-${timestamp}`;
    const worktreePath = path.join(this.worktreesDir, worktreeName);
    const m2Path = path.join(worktreePath, '.m2');

    try {
      // 确保工作目录存在
      fs.mkdirSync(this.worktreesDir, { recursive: true });

      // 1. 创建新分支（基于 main）
      execSync(`git branch ${branchName} main`, {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      // 2. 创建 Worktree
      execSync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      // 3. 移除自动创建的目录结构（保留 .git 文件）
      const autoCreatedSrc = path.join(worktreePath, 'src');
      const autoCreatedPom = path.join(worktreePath, 'pom.xml');
      
      if (fs.existsSync(autoCreatedSrc)) {
        fs.rmSync(autoCreatedSrc, { recursive: true });
      }
      if (fs.existsSync(autoCreatedPom)) {
        fs.unlinkSync(autoCreatedPom);
      }

      // 4. 创建独立的 .m2 目录
      fs.mkdirSync(m2Path, { recursive: true });
      fs.mkdirSync(path.join(m2Path, 'repository'), { recursive: true });

      // 5. 建立软链接
      const mainPath = path.join(this.projectRoot, 'main');
      
      // src 目录软链接 (Windows junction)
      const relativeSrcPath = path.relative(worktreePath, path.join(mainPath, 'src'));
      try {
        fs.symlinkSync(relativeSrcPath, path.join(worktreePath, 'src'), 'junction');
      } catch (e) {
        // 如果不支持 junction，使用目录符号链接
        fs.symlinkSync(relativeSrcPath, path.join(worktreePath, 'src'), 'dir');
      }

      // pom.xml 软链接
      const relativePomPath = path.relative(worktreePath, path.join(mainPath, 'pom.xml'));
      fs.symlinkSync(relativePomPath, path.join(worktreePath, 'pom.xml'), 'file');

      // 6. 创建独立的 target 目录
      fs.mkdirSync(path.join(worktreePath, 'target'), { recursive: true });

      const worktree: WorktreeConfig = {
        id: worktreeName,
        path: worktreePath,
        branch: branchName,
        m2Path,
        createdAt: timestamp
      };

      this.worktrees.set(worktreeName, worktree);
      
      console.log(`[WorktreePool] Created worktree: ${worktreeName} at ${worktreePath}`);
      
      return worktree;

    } catch (error) {
      // 清理失败的创建
      await this.cleanupFailedCreation(worktreePath, branchName);
      throw error;
    }
  }

  /**
   * 清理失败的 Worktree 创建
   */
  private async cleanupFailedCreation(worktreePath: string, branchName: string): Promise<void> {
    try {
      // 移除 Worktree
      if (fs.existsSync(worktreePath)) {
        execSync(`git worktree remove "${worktreePath}" --force`, {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });
      }
      
      // 删除分支
      try {
        execSync(`git branch -D ${branchName}`, {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });
      } catch (e) {
        // 分支可能不存在，忽略错误
      }
    } catch (e) {
      console.error('[WorktreePool] Cleanup failed:', e);
    }
  }

  /**
   * 获取 Worktree
   */
  getWorktree(worktreeId: string): WorktreeConfig | undefined {
    return this.worktrees.get(worktreeId);
  }

  /**
   * 列出所有 Worktree
   */
  listWorktrees(): WorktreeConfig[] {
    return Array.from(this.worktrees.values());
  }

  /**
   * 销毁指定 Worktree
   */
  async destroyWorktree(worktreeId: string): Promise<void> {
    const worktree = this.worktrees.get(worktreeId);
    if (!worktree) {
      console.warn(`[WorktreePool] Worktree ${worktreeId} not found`);
      return;
    }

    try {
      // 1. 移除 Git Worktree
      execSync(`git worktree remove "${worktree.path}" --force`, {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      // 2. 删除分支
      try {
        execSync(`git branch -D ${worktree.branch}`, {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });
      } catch (e) {
        console.warn(`[WorktreePool] Failed to delete branch ${worktree.branch}:`, e);
      }

      // 3. 从映射中移除
      this.worktrees.delete(worktreeId);

      console.log(`[WorktreePool] Destroyed worktree: ${worktreeId}`);

    } catch (error) {
      console.error(`[WorktreePool] Failed to destroy worktree ${worktreeId}:`, error);
      throw error;
    }
  }

  /**
   * 销毁所有 Worktree
   */
  async destroyAll(): Promise<void> {
    const worktreeIds = Array.from(this.worktrees.keys());
    
    console.log(`[WorktreePool] Destroying ${worktreeIds.length} worktrees...`);
    
    const errors: string[] = [];
    
    for (const worktreeId of worktreeIds) {
      try {
        await this.destroyWorktree(worktreeId);
      } catch (error) {
        errors.push(worktreeId);
      }
    }

    if (errors.length > 0) {
      console.warn(`[WorktreePool] Failed to destroy ${errors.length} worktrees:`, errors);
    }

    // 清理 .dtagent/worktrees 目录
    if (fs.existsSync(this.worktreesDir)) {
      fs.rmSync(this.worktreesDir, { recursive: true });
    }
  }
}