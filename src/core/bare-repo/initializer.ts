import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { InitializationResult, ValidationResult, BareRepoInfo } from './types';

/**
 * Bare Repository 初始化器
 * 
 * 负责将普通 Git 仓库转换为 Bare Repository 结构
 * 此过程是一次性的，转换后不可回退
 */
export class BareRepoInitializer {
  private projectRoot: string;
  private barePath: string;
  private gitFile: string;
  private mainWorktreePath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.barePath = path.join(projectRoot, '.bare');
    this.gitFile = path.join(projectRoot, '.git');
    this.mainWorktreePath = path.join(projectRoot, 'main');
  }

  /**
   * 检查是否已是 Bare Repository
   */
  isBareRepo(): boolean {
    return fs.existsSync(this.barePath) && fs.statSync(this.barePath).isDirectory();
  }

  /**
   * 获取 Bare Repo 信息
   */
  getInfo(): BareRepoInfo | null {
    if (!this.isBareRepo()) {
      return null;
    }
    return {
      barePath: this.barePath,
      mainWorktreePath: this.mainWorktreePath
    };
  }

  /**
   * 验证是否可转换为 Bare Repo
   */
  validate(): ValidationResult {
    // 如果已是 Bare Repo，直接返回有效
    if (this.isBareRepo()) {
      return { valid: true };
    }

    // 检查是否是 Git 仓库
    const gitDir = path.join(this.projectRoot, '.git');
    if (!fs.existsSync(gitDir)) {
      return { valid: false, reason: 'Not a Git repository' };
    }

    // 检查是否有未提交的更改
    try {
      const status = execSync('git status --porcelain', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      });
      if (status.trim()) {
        return { valid: false, reason: 'Working directory not clean. Please commit or stash changes.' };
      }
    } catch (error) {
      return { valid: false, reason: 'Failed to check Git status' };
    }

    // 检查是否有远程仓库
    try {
      execSync('git remote get-url origin', {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });
    } catch (error) {
      return { valid: false, reason: 'No remote repository configured' };
    }

    return { valid: true };
  }

  /**
   * 执行转换为 Bare Repository
   */
  async initialize(): Promise<InitializationResult> {
    // 如果已是 Bare Repo，直接返回
    if (this.isBareRepo()) {
      return {
        success: true,
        barePath: this.barePath,
        mainWorktreePath: this.mainWorktreePath
      };
    }

    // 验证
    const validation = this.validate();
    if (!validation.valid) {
      return {
        success: false,
        error: validation.reason
      };
    }

    try {
      // 1. 获取当前分支
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      }).trim();

      // 2. 备份原 .git 目录
      const backupPath = `${this.gitFile}.backup`;
      fs.renameSync(this.gitFile, backupPath);

      try {
        // 3. 创建 .bare 目录
        fs.mkdirSync(this.barePath, { recursive: true });

        // 4. 移动备份内容到 .bare
        fs.renameSync(backupPath, this.barePath);

        // 5. 更新 Git 配置为 bare
        const configPath = path.join(this.barePath, 'config');
        let config = fs.readFileSync(configPath, 'utf8');
        if (!config.includes('bare = true')) {
          config = config.replace(/\[core\]/, '[core]\n    bare = true');
          fs.writeFileSync(configPath, config);
        }

        // 6. 创建 .git 文件（不是目录）
        fs.writeFileSync(this.gitFile, 'gitdir: ./.bare\n');

        // 7. 配置 fetch 规则
        execSync('git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"', {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });

        // 8. 启用相对路径
        execSync('git config worktree.useRelativePaths true', {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });

        // 9. 创建 main Worktree
        execSync(`git worktree add main ${currentBranch}`, {
          cwd: this.projectRoot,
          stdio: 'pipe'
        });

        console.log('[BareRepoInitializer] Successfully converted to bare repository');
        console.log(`[BareRepoInitializer] Main worktree: ${this.mainWorktreePath}`);

        return {
          success: true,
          barePath: this.barePath,
          mainWorktreePath: this.mainWorktreePath
        };

      } catch (error) {
        // 回滚
        if (fs.existsSync(this.barePath)) {
          fs.rmSync(this.barePath, { recursive: true });
        }
        if (fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, this.gitFile);
        }
        throw error;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[BareRepoInitializer] Failed to initialize:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}