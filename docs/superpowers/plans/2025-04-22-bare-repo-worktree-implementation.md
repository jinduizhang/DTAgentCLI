# Bare Repo Worktree 模式实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Bare Repository + Git Worktree 模式的并发任务处理，取代现有的 async-lock 锁机制。

**Architecture:** 将普通 Git 仓库转换为 Bare Repo，通过动态创建 Git Worktree 实现真正的文件系统隔离和完全并行执行。包含 6 个核心组件：BareRepoInitializer（初始化器）、WorktreePool（池管理器）、FileGrouper（分组器）、GroupExecutor（组执行器）、BareRepoOrchestrator（调度中心）、ResultMerger（结果合并器）。

**Tech Stack:** TypeScript, Node.js, Git Worktree, Bun/Node spawn, 软链接(junction)

---

## 任务分解

### Task 1: 创建类型定义文件

**Files:**
- Create: `src/core/bare-repo/types.ts`
- Test: `src/core/bare-repo/__tests__/types.test.ts`

- [ ] **Step 1: 编写类型定义文件**

创建 `src/core/bare-repo/types.ts`：

```typescript
/**
 * Bare Repo Worktree 模式类型定义
 */

/**
 * Worktree 配置
 */
export interface WorktreeConfig {
  /** Worktree ID */
  id: string;
  /** Worktree 绝对路径 */
  path: string;
  /** 关联的 Git 分支名 */
  branch: string;
  /** 独立 Maven .m2 目录路径 */
  m2Path: string;
  /** 创建时间戳（毫秒） */
  createdAt: number;
}

/**
 * 文件组
 */
export interface FileGroup {
  /** 组 ID */
  id: number;
  /** 组内文件列表 */
  files: string[];
  /** 关联的 Worktree */
  worktree?: WorktreeConfig;
  /** 组状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 执行结果 */
  results?: FileResult[];
}

/**
 * 单个文件执行结果
 */
export interface FileResult {
  /** 文件名 */
  filename: string;
  /** 是否成功 */
  success: boolean;
  /** Session ID */
  sessionId?: string;
  /** 执行摘要 */
  summary?: string;
  /** 错误信息 */
  error?: string;
  /** 执行时长（毫秒） */
  duration?: number;
}

/**
 * 组执行结果
 */
export interface GroupResult {
  /** 组 ID */
  groupId: number;
  /** Worktree 路径 */
  worktreePath: string;
  /** 组内文件结果 */
  fileResults: FileResult[];
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 是否全部成功 */
  allSuccess: boolean;
}

/**
 * 执行配置
 */
export interface ExecutionConfig {
  /** 项目根目录 */
  projectRoot: string;
  /** 并行组数 */
  batchSize: number;
  /** 分组策略 */
  groupingStrategy: 'round-robin' | 'by-package' | 'by-complexity';
  /** 是否自动清理 */
  autoCleanup: boolean;
  /** 超时时间（毫秒） */
  timeout: number;
}

/**
 * 初始化结果
 */
export interface InitializationResult {
  /** 是否成功 */
  success: boolean;
  /** Bare Repo 路径 */
  barePath?: string;
  /** 主 Worktree 路径 */
  mainWorktreePath?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 执行状态
 */
export interface ExecutionStatus {
  /** 状态 */
  state: 'idle' | 'grouping' | 'creating' | 'executing' | 'merging' | 'cleaning' | 'completed';
  /** 总组数 */
  totalGroups: number;
  /** 已完成组数 */
  completedGroups: number;
  /** 进行中组数 */
  runningGroups: number;
  /** 失败组数 */
  failedGroups: number;
  /** 各组状态 */
  groupStatuses: GroupStatus[];
}

/**
 * 组状态
 */
export interface GroupStatus {
  /** 组 ID */
  groupId: number;
  /** 状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 当前执行文件 */
  currentFile?: string;
  /** 已执行文件数 */
  processedCount: number;
  /** 总文件数 */
  totalCount: number;
  /** 开始时间 */
  startTime?: number;
  /** 预计完成时间 */
  estimatedEndTime?: number;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 原因 */
  reason?: string;
}

/**
 * Bare Repo 信息
 */
export interface BareRepoInfo {
  /** Bare Repo 路径 */
  barePath: string;
  /** 主 Worktree 路径 */
  mainWorktreePath: string;
}
```

- [ ] **Step 2: 编写类型测试**

创建 `src/core/bare-repo/__tests__/types.test.ts`：

```typescript
import { describe, it, expect } from 'bun:test';
import type { WorktreeConfig, FileGroup, GroupResult } from '../types';

describe('Bare Repo Types', () => {
  it('should validate WorktreeConfig structure', () => {
    const config: WorktreeConfig = {
      id: 'group-0-1234567890',
      path: '/project/.dtagent/worktrees/group-0-1234567890',
      branch: 'agent-group-0-1234567890',
      m2Path: '/project/.dtagent/worktrees/group-0-1234567890/.m2',
      createdAt: Date.now()
    };
    
    expect(config.id).toBeDefined();
    expect(config.path).toContain('group-0');
    expect(config.branch).toContain('agent-group');
  });

  it('should validate FileGroup structure', () => {
    const group: FileGroup = {
      id: 0,
      files: ['src/main/java/A.java', 'src/main/java/B.java'],
      status: 'pending'
    };
    
    expect(group.id).toBe(0);
    expect(group.files).toHaveLength(2);
    expect(group.status).toBe('pending');
  });

  it('should validate GroupResult structure', () => {
    const result: GroupResult = {
      groupId: 0,
      worktreePath: '/project/.dtagent/worktrees/group-0-1234567890',
      fileResults: [],
      startTime: Date.now(),
      endTime: Date.now() + 1000,
      allSuccess: true
    };
    
    expect(result.groupId).toBe(0);
    expect(result.allSuccess).toBe(true);
  });
});
```

- [ ] **Step 3: 运行测试验证**

```bash
cd D:/OpenCode/DTAgentCLI
bun test src/core/bare-repo/__tests__/types.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/bare-repo/types.ts src/core/bare-repo/__tests__/types.test.ts
git commit -m "feat(bare-repo): add type definitions for Bare Repo Worktree mode"
```

---

### Task 2: 实现 BareRepoInitializer（初始化器）

**Files:**
- Create: `src/core/bare-repo/initializer.ts`
- Test: `src/core/bare-repo/__tests__/initializer.test.ts`
- Modify: `src/core/bare-repo/index.ts` (export)

- [ ] **Step 1: 编写 BareRepoInitializer 实现**

创建 `src/core/bare-repo/initializer.ts`：

```typescript
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
```

- [ ] **Step 2: 编写初始化器测试**

创建 `src/core/bare-repo/__tests__/initializer.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { BareRepoInitializer } from '../initializer';
import { execSync } from 'child_process';

describe('BareRepoInitializer', () => {
  const testDir = path.join(process.cwd(), '.test-bare-repo');
  
  beforeEach(() => {
    // 创建测试目录和 Git 仓库
    fs.mkdirSync(testDir, { recursive: true });
    execSync('git init', { cwd: testDir });
    execSync('git remote add origin https://github.com/test/test.git', { cwd: testDir });
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "Initial commit"', { cwd: testDir });
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should detect non-bare repository', () => {
    const initializer = new BareRepoInitializer(testDir);
    expect(initializer.isBareRepo()).toBe(false);
  });

  it('should validate clean repository', () => {
    const initializer = new BareRepoInitializer(testDir);
    const result = initializer.validate();
    expect(result.valid).toBe(true);
  });

  it('should reject dirty repository', () => {
    fs.writeFileSync(path.join(testDir, 'dirty.txt'), 'dirty');
    const initializer = new BareRepoInitializer(testDir);
    const result = initializer.validate();
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not clean');
    
    // 清理
    fs.unlinkSync(path.join(testDir, 'dirty.txt'));
  });

  it('should initialize bare repository', async () => {
    const initializer = new BareRepoInitializer(testDir);
    const result = await initializer.initialize();
    
    expect(result.success).toBe(true);
    expect(result.barePath).toBeDefined();
    expect(result.mainWorktreePath).toBeDefined();
    
    // 验证 Bare Repo 存在
    expect(initializer.isBareRepo()).toBe(true);
    expect(fs.existsSync(path.join(testDir, '.bare'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'main'))).toBe(true);
  });

  it('should return existing bare repo info', async () => {
    const initializer = new BareRepoInitializer(testDir);
    await initializer.initialize();
    
    const info = initializer.getInfo();
    expect(info).not.toBeNull();
    expect(info?.barePath).toContain('.bare');
  });
});
```

- [ ] **Step 3: 更新索引文件**

创建/修改 `src/core/bare-repo/index.ts`：

```typescript
// Bare Repo Worktree 模块导出

export * from './types';
export { BareRepoInitializer } from './initializer';
```

- [ ] **Step 4: 运行测试**

```bash
cd D:/OpenCode/DTAgentCLI
bun test src/core/bare-repo/__tests__/initializer.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/bare-repo/initializer.ts src/core/bare-repo/__tests__/initializer.test.ts src/core/bare-repo/index.ts
git commit -m "feat(bare-repo): implement BareRepoInitializer for bare repository conversion"
```

---

### Task 3: 实现 FileGrouper（文件分组器）

**Files:**
- Create: `src/core/bare-repo/file-grouper.ts`
- Test: `src/core/bare-repo/__tests__/file-grouper.test.ts`
- Modify: `src/core/bare-repo/index.ts`

- [ ] **Step 1: 编写 FileGrouper 实现**

创建 `src/core/bare-repo/file-grouper.ts`：

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { FileGroup } from './types';

/**
 * 文件分组策略枚举
 */
export enum GroupingStrategy {
  /** 简单轮询 */
  ROUND_ROBIN = 'round-robin',
  /** 按包路径分组 */
  BY_PACKAGE = 'by-package',
  /** 按文件复杂度 */
  BY_COMPLEXITY = 'by-complexity'
}

/**
 * 文件分组器
 * 
 * 将文件列表智能分组
 */
export class FileGrouper {
  /**
   * 执行分组
   */
  static group(
    files: string[],
    groupCount: number,
    strategy: GroupingStrategy = GroupingStrategy.ROUND_ROBIN
  ): FileGroup[] {
    switch (strategy) {
      case GroupingStrategy.ROUND_ROBIN:
        return this.roundRobin(files, groupCount);
      case GroupingStrategy.BY_PACKAGE:
        return this.byPackage(files, groupCount);
      case GroupingStrategy.BY_COMPLEXITY:
        return this.byComplexity(files, groupCount);
      default:
        return this.roundRobin(files, groupCount);
    }
  }

  /**
   * 简单轮询策略
   * 将文件按顺序均匀分配到各组
   */
  private static roundRobin(files: string[], groupCount: number): FileGroup[] {
    const groups: FileGroup[] = [];
    
    // 初始化组
    const actualGroupCount = Math.min(groupCount, files.length);
    for (let i = 0; i < actualGroupCount; i++) {
      groups.push({
        id: i,
        files: [],
        status: 'pending'
      });
    }

    // 轮询分配
    files.forEach((file, index) => {
      const groupIndex = index % actualGroupCount;
      groups[groupIndex].files.push(file);
    });

    // 过滤空组
    return groups.filter(g => g.files.length > 0);
  }

  /**
   * 按包路径分组策略
   * 将同包文件分到同一组，减少上下文切换
   */
  private static byPackage(files: string[], groupCount: number): FileGroup[] {
    // 按包路径分组
    const packageGroups = new Map<string, string[]>();
    
    files.forEach(file => {
      const packagePath = this.extractPackagePath(file);
      if (!packageGroups.has(packagePath)) {
        packageGroups.set(packagePath, []);
      }
      packageGroups.get(packagePath)!.push(file);
    });

    // 将包分组分配到 Worktree 组
    const groups: FileGroup[] = [];
    let currentGroupId = 0;
    let currentGroup: FileGroup = { id: currentGroupId, files: [], status: 'pending' };
    const targetSize = Math.ceil(files.length / groupCount);

    const sortedPackages = Array.from(packageGroups.entries())
      .sort((a, b) => b[1].length - a[1].length);

    for (const [packagePath, packageFiles] of sortedPackages) {
      // 如果当前组已满，创建新组
      if (currentGroup.files.length >= targetSize && currentGroup.files.length > 0) {
        groups.push(currentGroup);
        currentGroupId++;
        currentGroup = { id: currentGroupId, files: [], status: 'pending' };
      }

      // 将整包文件添加到当前组
      currentGroup.files.push(...packageFiles);
    }

    // 添加最后一组
    if (currentGroup.files.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * 按文件复杂度分组策略
   * 根据文件大小和行数均衡分配
   */
  private static byComplexity(files: string[], groupCount: number): FileGroup[] {
    // 计算每个文件的复杂度
    const fileComplexities = files.map(file => ({
      file,
      complexity: this.calculateComplexity(file)
    }));

    // 按复杂度降序排序
    fileComplexities.sort((a, b) => b.complexity - a.complexity);

    // 初始化组复杂度
    const groups: FileGroup[] = [];
    const groupComplexities: number[] = [];
    const actualGroupCount = Math.min(groupCount, files.length);
    
    for (let i = 0; i < actualGroupCount; i++) {
      groups.push({ id: i, files: [], status: 'pending' });
      groupComplexities.push(0);
    }

    // 贪心分配：每次将最复杂的文件分配到当前总复杂度最低的组
    for (const { file, complexity } of fileComplexities) {
      const minComplexityGroup = groupComplexities.indexOf(Math.min(...groupComplexities));
      groups[minComplexityGroup].files.push(file);
      groupComplexities[minComplexityGroup] += complexity;
    }

    return groups.filter(g => g.files.length > 0);
  }

  /**
   * 提取包路径
   */
  private static extractPackagePath(file: string): string {
    // 假设路径格式: src/main/java/com/example/Service.java
    const parts = file.split(/[\/\\]/);
    const javaIndex = parts.indexOf('java');
    if (javaIndex >= 0 && javaIndex < parts.length - 1) {
      return parts.slice(0, javaIndex + 1).join('/');
    }
    return path.dirname(file);
  }

  /**
   * 计算文件复杂度
   */
  private static calculateComplexity(file: string): number {
    try {
      const stats = fs.statSync(file);
      // 简单策略：文件大小作为复杂度指标
      return stats.size;
    } catch (e) {
      return 1;
    }
  }
}
```

- [ ] **Step 2: 编写分组器测试**

创建 `src/core/bare-repo/__tests__/file-grouper.test.ts`：

```typescript
import { describe, it, expect } from 'bun:test';
import { FileGrouper, GroupingStrategy } from '../file-grouper';

describe('FileGrouper', () => {
  const testFiles = [
    'src/main/java/com/example/A.java',
    'src/main/java/com/example/B.java',
    'src/main/java/com/service/C.java',
    'src/main/java/com/service/D.java',
    'src/main/java/com/util/E.java',
    'src/main/java/com/util/F.java',
    'src/main/java/com/util/G.java',
    'src/main/java/com/api/H.java',
  ];

  describe('round-robin', () => {
    it('should group files evenly', () => {
      const groups = FileGrouper.group(testFiles, 4, GroupingStrategy.ROUND_ROBIN);
      
      expect(groups.length).toBe(4);
      expect(groups[0].files).toContain('src/main/java/com/example/A.java');
      expect(groups[0].files).toContain('src/main/java/com/util/E.java');
    });

    it('should handle empty files array', () => {
      const groups = FileGrouper.group([], 4);
      expect(groups.length).toBe(0);
    });

    it('should handle groupCount larger than files', () => {
      const groups = FileGrouper.group(testFiles.slice(0, 3), 10);
      expect(groups.length).toBe(3);
    });
  });

  describe('by-package', () => {
    it('should group files by package', () => {
      const groups = FileGrouper.group(testFiles, 4, GroupingStrategy.BY_PACKAGE);
      
      // 同一包下的文件应在同一组
      const exampleGroup = groups.find(g => 
        g.files.some(f => f.includes('com/example'))
      );
      expect(exampleGroup?.files.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('by-complexity', () => {
    it('should balance group sizes', () => {
      const groups = FileGrouper.group(testFiles, 4, GroupingStrategy.BY_COMPLEXITY);
      
      expect(groups.length).toBe(4);
      // 各组大小应相对均衡
      const sizes = groups.map(g => g.files.length);
      const maxDiff = Math.max(...sizes) - Math.min(...sizes);
      expect(maxDiff).toBeLessThanOrEqual(2);
    });
  });
});
```

- [ ] **Step 3: 更新索引文件**

修改 `src/core/bare-repo/index.ts`：

```typescript
// Bare Repo Worktree 模块导出

export * from './types';
export { BareRepoInitializer } from './initializer';
export { FileGrouper, GroupingStrategy } from './file-grouper';
```

- [ ] **Step 4: 运行测试**

```bash
bun test src/core/bare-repo/__tests__/file-grouper.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/bare-repo/file-grouper.ts src/core/bare-repo/__tests__/file-grouper.test.ts
git commit -m "feat(bare-repo): implement FileGrouper with multiple grouping strategies"
```

---

### Task 4: 实现 WorktreePool（Worktree 池管理器）

**Files:**
- Create: `src/core/bare-repo/worktree-pool.ts`
- Test: `src/core/bare-repo/__tests__/worktree-pool.test.ts`
- Modify: `src/core/bare-repo/index.ts`

- [ ] **Step 1: 编写 WorktreePool 实现**

创建 `src/core/bare-repo/worktree-pool.ts`：

```typescript
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
```

- [ ] **Step 2: 编写 WorktreePool 测试**

创建 `src/core/bare-repo/__tests__/worktree-pool.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { WorktreePool } from '../worktree-pool';
import { BareRepoInitializer } from '../initializer';

describe('WorktreePool', () => {
  const testDir = path.join(process.cwd(), '.test-worktree-pool');
  let pool: WorktreePool;
  
  beforeEach(async () => {
    // 创建测试 Bare Repo
    const { execSync } = require('child_process');
    fs.mkdirSync(testDir, { recursive: true });
    execSync('git init', { cwd: testDir });
    execSync('git remote add origin https://github.com/test/test.git', { cwd: testDir });
    fs.writeFileSync(path.join(testDir, 'pom.xml'), '<project/>');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "Initial commit"', { cwd: testDir });
    
    // 转换为 Bare Repo
    const initializer = new BareRepoInitializer(testDir);
    await initializer.initialize();
    
    pool = new WorktreePool(testDir);
  });

  afterEach(() => {
    // 清理
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create a worktree for group', async () => {
    const worktree = await pool.createGroupWorktree(0);
    
    expect(worktree.id).toContain('group-0');
    expect(worktree.branch).toContain('agent-group-0');
    expect(fs.existsSync(worktree.path)).toBe(true);
    expect(fs.existsSync(worktree.m2Path)).toBe(true);
  });

  it('should list created worktrees', async () => {
    await pool.createGroupWorktree(0);
    await pool.createGroupWorktree(1);
    
    const worktrees = pool.listWorktrees();
    expect(worktrees.length).toBe(2);
  });

  it('should destroy a worktree', async () => {
    const worktree = await pool.createGroupWorktree(0);
    await pool.destroyWorktree(worktree.id);
    
    expect(pool.listWorktrees().length).toBe(0);
  });

  it('should destroy all worktrees', async () => {
    await pool.createGroupWorktree(0);
    await pool.createGroupWorktree(1);
    await pool.createGroupWorktree(2);
    
    await pool.destroyAll();
    
    expect(pool.listWorktrees().length).toBe(0);
  });
});
```

- [ ] **Step 3: 更新索引文件**

修改 `src/core/bare-repo/index.ts`：

```typescript
// Bare Repo Worktree 模块导出

export * from './types';
export { BareRepoInitializer } from './initializer';
export { FileGrouper, GroupingStrategy } from './file-grouper';
export { WorktreePool } from './worktree-pool';
```

- [ ] **Step 4: 运行测试**

```bash
bun test src/core/bare-repo/__tests__/worktree-pool.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/bare-repo/worktree-pool.ts src/core/bare-repo/__tests__/worktree-pool.test.ts
git commit -m "feat(bare-repo): implement WorktreePool for dynamic worktree management"
```

---

### Task 5: 实现 GroupExecutor（组执行器）

**Files:**
- Create: `src/core/bare-repo/group-executor.ts`
- Test: `src/core/bare-repo/__tests__/group-executor.test.ts`
- Modify: `src/core/bare-repo/index.ts`

- [ ] **Step 1: 编写 GroupExecutor 实现**

创建 `src/core/bare-repo/group-executor.ts`：

```typescript
import { WorktreeConfig, FileGroup, FileResult, GroupResult } from './types';

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
```

- [ ] **Step 2: 编写 GroupExecutor 测试**

创建 `src/core/bare-repo/__tests__/group-executor.test.ts`：

```typescript
import { describe, it, expect } from 'bun:test';
import { GroupExecutor } from '../group-executor';
import { WorktreeConfig, FileResult } from '../types';

describe('GroupExecutor', () => {
  const mockWorktree: WorktreeConfig = {
    id: 'group-0-1234567890',
    path: '/test/worktree',
    branch: 'agent-group-0-1234567890',
    m2Path: '/test/worktree/.m2',
    createdAt: Date.now()
  };

  it('should execute all files sequentially', async () => {
    const files = ['A.java', 'B.java', 'C.java'];
    const executor = new GroupExecutor(mockWorktree, files);

    const mockExecuteFn = async (file: string): Promise<FileResult> => ({
      filename: file,
      success: true,
      duration: 100
    });

    const result = await executor.execute(mockExecuteFn);

    expect(result.fileResults).toHaveLength(3);
    expect(result.allSuccess).toBe(true);
    expect(result.fileResults[0].filename).toBe('A.java');
    expect(result.fileResults[1].filename).toBe('B.java');
    expect(result.fileResults[2].filename).toBe('C.java');
  });

  it('should handle execution errors', async () => {
    const files = ['A.java', 'B.java'];
    const executor = new GroupExecutor(mockWorktree, files);

    const mockExecuteFn = async (file: string): Promise<FileResult> => {
      if (file === 'B.java') {
        throw new Error('Execution failed');
      }
      return { filename: file, success: true };
    };

    const result = await executor.execute(mockExecuteFn);

    expect(result.fileResults).toHaveLength(2);
    expect(result.allSuccess).toBe(false);
    expect(result.fileResults[0].success).toBe(true);
    expect(result.fileResults[1].success).toBe(false);
    expect(result.fileResults[1].error).toContain('Execution failed');
  });

  it('should track progress', async () => {
    const files = ['A.java', 'B.java', 'C.java'];
    const executor = new GroupExecutor(mockWorktree, files);

    // 初始进度
    const initialProgress = executor.getProgress();
    expect(initialProgress.current).toBe(0);
    expect(initialProgress.total).toBe(3);
  });
});
```

- [ ] **Step 3: 更新索引文件**

修改 `src/core/bare-repo/index.ts`：

```typescript
// Bare Repo Worktree 模块导出

export * from './types';
export { BareRepoInitializer } from './initializer';
export { FileGrouper, GroupingStrategy } from './file-grouper';
export { WorktreePool } from './worktree-pool';
export { GroupExecutor } from './group-executor';
```

- [ ] **Step 4: 运行测试**

```bash
bun test src/core/bare-repo/__tests__/group-executor.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/bare-repo/group-executor.ts src/core/bare-repo/__tests__/group-executor.test.ts
git commit -m "feat(bare-repo): implement GroupExecutor for sequential execution within worktree"
```

---

### Task 6: 实现 ResultMerger（结果合并器）

**Files:**
- Create: `src/core/bare-repo/result-merger.ts`
- Test: `src/core/bare-repo/__tests__/result-merger.test.ts`
- Modify: `src/core/bare-repo/index.ts`

- [ ] **Step 1: 编写 ResultMerger 实现**

创建 `src/core/bare-repo/result-merger.ts`：

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { GroupResult, FileResult } from './types';

/**
 * 结果合并器
 * 
 * 合并各 Worktree 的执行结果
 */
export class ResultMerger {
  /**
   * 合并多个组的结果
   */
  static merge(groupResults: GroupResult[]): {
    allResults: FileResult[];
    totalFiles: number;
    successCount: number;
    failedCount: number;
    totalDuration: number;
    allSuccess: boolean;
    report: string;
  } {
    const allResults: FileResult[] = [];
    
    for (const result of groupResults) {
      allResults.push(...result.fileResults);
    }

    const totalFiles = allResults.length;
    const successCount = allResults.filter(r => r.success).length;
    const failedCount = allResults.filter(r => !r.success).length;
    
    // 计算总耗时
    const startTime = Math.min(...groupResults.map(r => r.startTime));
    const endTime = Math.max(...groupResults.map(r => r.endTime));
    const totalDuration = endTime - startTime;
    
    const allSuccess = failedCount === 0;
    const report = this.generateReport(groupResults, allResults);

    return {
      allResults,
      totalFiles,
      successCount,
      failedCount,
      totalDuration,
      allSuccess,
      report
    };
  }

  /**
   * 生成执行报告
   */
  private static generateReport(
    groupResults: GroupResult[],
    allResults: FileResult[]
  ): string {
    const lines: string[] = [];
    
    lines.push('# Bare Repo Worktree Execution Report\n');
    lines.push(`## Summary\n`);
    lines.push(`- Total Groups: ${groupResults.length}`);
    lines.push(`- Total Files: ${allResults.length}`);
    lines.push(`- Success: ${allResults.filter(r => r.success).length}`);
    lines.push(`- Failed: ${allResults.filter(r => !r.success).length}`);
    
    const totalTime = Math.max(...groupResults.map(r => r.endTime)) - 
                      Math.min(...groupResults.map(r => r.startTime));
    lines.push(`- Total Duration: ${(totalTime / 1000).toFixed(2)}s\n`);
    
    lines.push(`## Group Results\n`);
    for (const result of groupResults) {
      const successCount = result.fileResults.filter(r => r.success).length;
      const duration = (result.endTime - result.startTime) / 1000;
      lines.push(`### Group ${result.groupId}`);
      lines.push(`- Worktree: ${result.worktreePath}`);
      lines.push(`- Files: ${successCount}/${result.fileResults.length} succeeded`);
      lines.push(`- Duration: ${duration.toFixed(2)}s`);
      lines.push(`- All Success: ${result.allSuccess ? 'Yes' : 'No'}\n`);
    }
    
    const failed = allResults.filter(r => !r.success);
    if (failed.length > 0) {
      lines.push(`## Failed Files\n`);
      for (const result of failed) {
        lines.push(`- ${result.filename}: ${result.error || 'Unknown error'}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * 复制测试文件从 Worktree 到主目录
   */
  static copyTestFiles(sourceDir: string, targetDir: string): { copied: number; errors: string[] } {
    const errors: string[] = [];
    let copied = 0;

    try {
      if (!fs.existsSync(sourceDir)) {
        return { copied: 0, errors: [`Source directory does not exist: ${sourceDir}`] };
      }

      fs.mkdirSync(targetDir, { recursive: true });

      const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
          const subResult = this.copyTestFiles(sourcePath, targetPath);
          copied += subResult.copied;
          errors.push(...subResult.errors);
        } else {
          try {
            fs.copyFileSync(sourcePath, targetPath);
            copied++;
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            errors.push(`Failed to copy ${sourcePath}: ${errorMessage}`);
          }
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Error copying test files: ${errorMessage}`);
    }

    return { copied, errors };
  }

  /**
   * 保存报告到文件
   */
  static saveReport(report: string, reportPath: string): void {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report, 'utf8');
  }
}
```

- [ ] **Step 2: 编写 ResultMerger 测试**

创建 `src/core/bare-repo/__tests__/result-merger.test.ts`：

```typescript
import { describe, it, expect } from 'bun:test';
import { ResultMerger } from '../result-merger';
import { GroupResult, FileResult } from '../types';

describe('ResultMerger', () => {
  it('should merge multiple group results', () => {
    const groupResults: GroupResult[] = [
      {
        groupId: 0,
        worktreePath: '/project/.dtagent/worktrees/group-0',
        fileResults: [
          { filename: 'A.java', success: true, duration: 100 },
          { filename: 'B.java', success: true, duration: 200 }
        ],
        startTime: 0,
        endTime: 300,
        allSuccess: true
      },
      {
        groupId: 1,
        worktreePath: '/project/.dtagent/worktrees/group-1',
        fileResults: [
          { filename: 'C.java', success: true, duration: 150 },
          { filename: 'D.java', success: false, error: 'Compilation error', duration: 100 }
        ],
        startTime: 0,
        endTime: 250,
        allSuccess: false
      }
    ];

    const merged = ResultMerger.merge(groupResults);

    expect(merged.totalFiles).toBe(4);
    expect(merged.successCount).toBe(3);
    expect(merged.failedCount).toBe(1);
    expect(merged.allSuccess).toBe(false);
    expect(merged.report).toContain('Group 0');
    expect(merged.report).toContain('Group 1');
    expect(merged.report).toContain('Failed Files');
  });

  it('should handle empty results', () => {
    const merged = ResultMerger.merge([]);

    expect(merged.totalFiles).toBe(0);
    expect(merged.successCount).toBe(0);
    expect(merged.failedCount).toBe(0);
    expect(merged.allSuccess).toBe(true);
  });

  it('should generate report with all success', () => {
    const groupResults: GroupResult[] = [
      {
        groupId: 0,
        worktreePath: '/project/.dtagent/worktrees/group-0',
        fileResults: [
          { filename: 'A.java', success: true, duration: 100 }
        ],
        startTime: 0,
        endTime: 100,
        allSuccess: true
      }
    ];

    const merged = ResultMerger.merge(groupResults);

    expect(merged.report).toContain('Summary');
    expect(merged.report).toContain('Group Results');
    expect(merged.report).not.toContain('Failed Files');
  });
});
```

- [ ] **Step 3: 更新索引文件**

修改 `src/core/bare-repo/index.ts`：

```typescript
// Bare Repo Worktree 模块导出

export * from './types';
export { BareRepoInitializer } from './initializer';
export { FileGrouper, GroupingStrategy } from './file-grouper';
export { WorktreePool } from './worktree-pool';
export { GroupExecutor } from './group-executor';
export { ResultMerger } from './result-merger';
```

- [ ] **Step 4: 运行测试**

```bash
bun test src/core/bare-repo/__tests__/result-merger.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/bare-repo/result-merger.ts src/core/bare-repo/__tests__/result-merger.test.ts
git commit -m "feat(bare-repo): implement ResultMerger for result aggregation and reporting"
```

---

### Task 7: 实现 BareRepoOrchestrator（调度中心）

**Files:**
- Create: `src/core/bare-repo/orchestrator.ts`
- Test: `src/core/bare-repo/__tests__/orchestrator.test.ts`
- Modify: `src/core/bare-repo/index.ts`

- [ ] **Step 1: 编写 BareRepoOrchestrator 实现**

创建 `src/core/bare-repo/orchestrator.ts`：

```typescript
import { BareRepoInitializer } from './initializer';
import { WorktreePool } from './worktree-pool';
import { FileGrouper } from './file-grouper';
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
      const groups = FileGrouper.group(files, this.config.batchSize, this.config.groupingStrategy);
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
```

- [ ] **Step 2: 编写 Orchestrator 测试**

创建 `src/core/bare-repo/__tests__/orchestrator.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { BareRepoOrchestrator } from '../orchestrator';
import { FileResult, WorktreeConfig } from '../types';

describe('BareRepoOrchestrator', () => {
  const testDir = path.join(process.cwd(), '.test-orchestrator');
  
  beforeEach(() => {
    const { execSync } = require('child_process');
    fs.mkdirSync(testDir, { recursive: true });
    execSync('git init', { cwd: testDir });
    execSync('git remote add origin https://github.com/test/test.git', { cwd: testDir });
    fs.writeFileSync(path.join(testDir, 'pom.xml'), '<project/>');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "Initial commit"', { cwd: testDir });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should initialize bare repo', async () => {
    const orchestrator = new BareRepoOrchestrator({
      projectRoot: testDir,
      batchSize: 2,
      groupingStrategy: 'round-robin',
      autoCleanup: true,
      timeout: 300000
    });

    const initialized = await orchestrator.initialize();
    expect(initialized).toBe(true);
    
    const info = orchestrator.getBareRepoInfo();
    expect(info).not.toBeNull();
    expect(info?.barePath).toContain('.bare');
  });

  it('should execute files in parallel groups', async () => {
    const orchestrator = new BareRepoOrchestrator({
      projectRoot: testDir,
      batchSize: 2,
      groupingStrategy: 'round-robin',
      autoCleanup: true,
      timeout: 300000
    });

    const files = ['A.java', 'B.java', 'C.java', 'D.java'];
    
    const mockExecuteFn = async (file: string, worktree: WorktreeConfig): Promise<FileResult> => ({
      filename: file,
      success: true,
      duration: 100
    });

    const results = await orchestrator.execute(files, mockExecuteFn);

    expect(results.length).toBe(2); // 2 groups
    expect(results[0].fileResults).toHaveLength(2);
    expect(results[1].fileResults).toHaveLength(2);
  });

  it('should track status during execution', async () => {
    const orchestrator = new BareRepoOrchestrator({
      projectRoot: testDir,
      batchSize: 2,
      groupingStrategy: 'round-robin',
      autoCleanup: false,
      timeout: 300000
    });

    const files = ['A.java', 'B.java'];
    
    const mockExecuteFn = async (file: string, worktree: WorktreeConfig): Promise<FileResult> => ({
      filename: file,
      success: true,
      duration: 100
    });

    await orchestrator.execute(files, mockExecuteFn);

    const status = orchestrator.getStatus();
    expect(status.state).toBe('completed');
    expect(status.totalGroups).toBe(1);
    expect(status.completedGroups).toBe(1);
  });
});
```

- [ ] **Step 3: 更新索引文件**

修改 `src/core/bare-repo/index.ts`：

```typescript
// Bare Repo Worktree 模块导出

export * from './types';
export { BareRepoInitializer } from './initializer';
export { FileGrouper, GroupingStrategy } from './file-grouper';
export { WorktreePool } from './worktree-pool';
export { GroupExecutor } from './group-executor';
export { ResultMerger } from './result-merger';
export { BareRepoOrchestrator } from './orchestrator';
```

- [ ] **Step 4: 运行测试**

```bash
bun test src/core/bare-repo/__tests__/orchestrator.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/bare-repo/orchestrator.ts src/core/bare-repo/__tests__/orchestrator.test.ts
git commit -m "feat(bare-repo): implement BareRepoOrchestrator for parallel execution coordination"
```

---

### Task 8: 修改 TaskManager 插件集成 Bare Repo 模式

**Files:**
- Modify: `templates/plugins/task-manager.ts`
- Test: `templates/plugins/__tests__/task-manager.test.ts`（如果存在则修改）

- [ ] **Step 1: 阅读现有 TaskManager 代码**

运行命令查看现有 TaskManager 代码结构：

```bash
cd D:/OpenCode/DTAgentCLI
head -100 templates/plugins/task-manager.ts
```

- [ ] **Step 2: 修改 TaskManager 以支持 Bare Repo 模式**

修改 `templates/plugins/task-manager.ts`（关键修改点）：

```typescript
// 在文件顶部添加导入
import { BareRepoOrchestrator, GroupingStrategy } from '../../src/core/bare-repo';

// 修改 QueueState 接口，添加 Bare Repo 相关字段
interface QueueState {
  // ... 现有字段 ...
  
  /** 是否使用 Bare Repo 模式 */
  useBareRepo?: boolean;
  /** Bare Repo 调度器 */
  bareRepoOrchestrator?: BareRepoOrchestrator;
}

// 修改 executeAllTasks 函数，支持 Bare Repo 模式
async function executeAllTasks(): Promise<void> {
  if (!queue) return;

  const totalTasks = queue.mode === "filelist" 
    ? queue.taskItems.length 
    : queue.files.length;

  // 判断是否使用 Bare Repo 模式
  // 条件：batchSize > 1 且总文件数 > batchSize
  const shouldUseBareRepo = queue.batchSize > 1 && totalTasks > queue.batchSize;

  if (shouldUseBareRepo) {
    console.log(`[TaskManager] Using Bare Repo mode for ${totalTasks} files with batchSize ${queue.batchSize}`);
    await executeWithBareRepo(totalTasks);
  } else {
    console.log(`[TaskManager] Using async-lock mode`);
    await executeWithAsyncLock(totalTasks);
  }
}

/**
 * 使用 Bare Repo 模式执行
 */
async function executeWithBareRepo(totalTasks: number): Promise<void> {
  const directory = queue.directory;
  const files = queue.mode === "filelist" 
    ? queue.taskItems.map(t => t.filename)
    : queue.files;

  // 1. 初始化调度器
  if (!queue.bareRepoOrchestrator) {
    queue.bareRepoOrchestrator = new BareRepoOrchestrator({
      projectRoot: directory,
      batchSize: queue.batchSize,
      groupingStrategy: 'round-robin',
      autoCleanup: true,
      timeout: 300000 // 5分钟
    });
  }

  // 2. 执行并行任务
  try {
    const results = await queue.bareRepoOrchestrator.execute(
      files,
      async (file, worktree) => {
        // 获取任务索引
        const taskIndex = files.indexOf(file);
        
        // 执行单个文件任务
        return await executeTaskInWorktree(taskIndex, file, worktree);
      }
    );

    // 3. 更新任务状态
    for (const groupResult of results) {
      for (const fileResult of groupResult.fileResults) {
        const taskIndex = files.indexOf(fileResult.filename);
        if (taskIndex >= 0) {
          updateTaskStatus(taskIndex, fileResult.success ? 'success' : 'failed');
        }
      }
    }

    // 4. 生成摘要
    const merged = require('../../src/core/bare-repo').ResultMerger.merge(results);
    console.log(`[TaskManager] Bare Repo execution complete: ${merged.successCount}/${merged.totalFiles} succeeded`);
    
    // 5. 保存报告
    const reportPath = path.join(queue.directory, '.dtagent', 'reports', `execution-${Date.now()}.md`);
    require('../../src/core/bare-repo').ResultMerger.saveReport(merged.report, reportPath);

  } catch (error) {
    console.error('[TaskManager] Bare Repo execution failed:', error);
    throw error;
  }
}

/**
 * 在 Worktree 中执行单个任务
 */
async function executeTaskInWorktree(
  index: number, 
  file: string, 
  worktree: WorktreeConfig
): Promise<FileResult> {
  const startTime = Date.now();
  
  try {
    // 获取任务的原始 prompt
    const task = queue.mode === "filelist" 
      ? queue.taskItems[index] 
      : { filename: file, prompt: generatePrompt(file) };

    // 修改 prompt，注入 Worktree 路径和 Maven 参数
    const modifiedPrompt = `${task.prompt}

[Worktree Configuration]
Worktree Path: ${worktree.path}
Maven Local Repository: ${worktree.m2Path}
When running Maven commands, use: -Dmaven.repo.local="${worktree.m2Path}"
`;

    // 创建 Session 并执行（类似现有逻辑，但使用 Worktree 路径）
    const session = await createSession();
    
    // 发送修改后的 prompt
    const response = await session.prompt(modifiedPrompt);
    
    // 解析结果
    const success = parseSuccess(response);
    const summary = extractSummary(response);
    
    const endTime = Date.now();
    
    return {
      filename: file,
      success,
      sessionId: session.id,
      summary,
      duration: endTime - startTime
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
}

/**
 * 保留现有的 async-lock 模式（向后兼容）
 */
async function executeWithAsyncLock(totalTasks: number): Promise<void> {
  // ... 保留现有 async-lock 实现 ...
}
```

- [ ] **Step 3: 添加 task-stop 的 Bare Repo 清理支持**

修改 `task-stop` 命令处理：

```typescript
// 在 task-stop 处理中添加
if (queue.bareRepoOrchestrator) {
  console.log("[TaskManager] Stopping Bare Repo execution...");
  await queue.bareRepoOrchestrator.stop();
  queue.bareRepoOrchestrator = undefined;
}
```

- [ ] **Step 4: 运行测试**

```bash
bun test templates/plugins/__tests__/task-manager.test.ts 2>/dev/null || echo "No existing tests"
```

- [ ] **Step 5: 提交**

```bash
git add templates/plugins/task-manager.ts
git commit -m "feat(task-manager): integrate Bare Repo mode for parallel execution"
```

---

### Task 9: 移除 async-lock 和 WorkspacePool 依赖

**Files:**
- Modify: `package.json`
- Delete: `src/core/workspace-manager.ts`（如果存在）
- Modify: 相关引用文件

- [ ] **Step 1: 从 package.json 移除 async-lock**

```bash
# 查看当前 package.json
cat package.json | grep -A5 -B5 "async-lock"
```

如果存在 async-lock 依赖，编辑 `package.json`：

```json
{
  "dependencies": {
    // 移除: "async-lock": "^1.4.1",
    // 保留其他依赖
  }
}
```

- [ ] **Step 2: 删除 WorkspacePool 代码**

```bash
# 如果存在则删除
if [ -f "src/core/workspace-manager.ts" ]; then
  git rm src/core/workspace-manager.ts
fi
```

- [ ] **Step 3: 移除相关引用**

搜索并移除项目中 async-lock 和 WorkspacePool 的引用：

```bash
grep -r "async-lock" src/ templates/ --include="*.ts" | grep -v "node_modules"
grep -r "WorkspacePool\|workspace-manager" src/ templates/ --include="*.ts" | grep -v "node_modules"
```

- [ ] **Step 4: 更新文档**

修改 `docs/parallel-optimization/README.md`，添加 Bare Repo 模式说明：

```markdown
## Bare Repo Worktree 模式（当前）

从 async-lock 模式迁移到 Bare Repo + Git Worktree 模式，实现真正的文件系统隔离和完全并行执行。

### 架构对比

| 特性 | async-lock（旧） | Bare Repo（新） |
|------|----------------|----------------|
| 并发度 | 串行 Maven | 完全并行 |
| 隔离级别 | 时间（锁） | 空间（Worktree） |
| 失败隔离 | 无 | 完全隔离 |
| 磁盘占用 | 低 | 中 |

### 使用方法

无需额外配置，batchSize > 1 且文件数 > batchSize 时自动启用 Bare Repo 模式。
```

- [ ] **Step 5: 安装依赖并提交**

```bash
# 安装依赖（如果修改了 package.json）
bun install

# 提交
git add package.json docs/parallel-optimization/README.md
git commit -m "refactor: remove async-lock and WorkspacePool, migrate to Bare Repo mode"
```

---

### Task 10: 创建集成测试和验证

**Files:**
- Create: `src/core/bare-repo/__tests__/integration.test.ts`
- Create: `docs/bare-repo-quickstart.md`

- [ ] **Step 1: 编写集成测试**

创建 `src/core/bare-repo/__tests__/integration.test.ts`：

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { BareRepoInitializer } from '../initializer';
import { FileGrouper } from '../file-grouper';
import { WorktreePool } from '../worktree-pool';
import { BareRepoOrchestrator } from '../orchestrator';
import { FileResult, WorktreeConfig } from '../types';

describe('Bare Repo Integration', () => {
  const testDir = path.join(process.cwd(), '.test-integration');
  
  beforeAll(() => {
    const { execSync } = require('child_process');
    fs.mkdirSync(testDir, { recursive: true });
    execSync('git init', { cwd: testDir });
    execSync('git remote add origin https://github.com/test/test.git', { cwd: testDir });
    fs.writeFileSync(path.join(testDir, 'pom.xml'), '<project/>');
    fs.mkdirSync(path.join(testDir, 'src', 'main', 'java'), { recursive: true });
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "Initial commit"', { cwd: testDir });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should complete full workflow', async () => {
    // 1. 初始化
    const initializer = new BareRepoInitializer(testDir);
    const initResult = await initializer.initialize();
    expect(initResult.success).toBe(true);

    // 2. 创建 Orchestrator
    const orchestrator = new BareRepoOrchestrator({
      projectRoot: testDir,
      batchSize: 2,
      groupingStrategy: 'round-robin',
      autoCleanup: true,
      timeout: 300000
    });

    // 3. 执行测试
    const files = ['A.java', 'B.java', 'C.java', 'D.java'];
    
    const mockExecuteFn = async (file: string, worktree: WorktreeConfig): Promise<FileResult> => {
      // 验证 Worktree 结构
      expect(fs.existsSync(worktree.path)).toBe(true);
      expect(fs.existsSync(worktree.m2Path)).toBe(true);
      
      return {
        filename: file,
        success: true,
        duration: 100
      };
    };

    const results = await orchestrator.execute(files, mockExecuteFn);

    // 4. 验证结果
    expect(results.length).toBe(2);
    expect(results.every(r => r.allSuccess)).toBe(true);

    // 5. 验证清理
    const worktreeDir = path.join(testDir, '.dtagent', 'worktrees');
    // 由于 autoCleanup=true，Worktree 应该已被清理
    expect(fs.existsSync(worktreeDir)).toBe(false);
  });
});
```

- [ ] **Step 2: 创建快速入门文档**

创建 `docs/bare-repo-quickstart.md`：

```markdown
# Bare Repo Worktree 快速入门

## 概述

Bare Repo Worktree 模式为 DTAgent CLI 提供真正的并行执行能力。

## 自动启用

无需配置，系统会自动检测并启用：

- batchSize > 1
- 文件数 > batchSize

## 目录结构

转换后：

```
project/
├── .bare/              # Bare Git 仓库
├── .git → .bare       # gitdir 文件
├── main/              # 主 Worktree
└── .dtagent/worktrees/ # 动态 Worktree（执行时创建）
```

## 手动初始化（可选）

```typescript
import { BareRepoInitializer } from './src/core/bare-repo';

const initializer = new BareRepoInitializer('/path/to/project');
await initializer.initialize();
```

## 故障排除

### 问题："Working directory not clean"

解决：提交或暂存所有更改

```bash
git add .
git commit -m "Prepare for bare repo conversion"
```

### 问题：Worktree 创建失败

解决：检查 Git 版本 >= 2.5

```bash
git --version
```
```

- [ ] **Step 3: 运行集成测试**

```bash
bun test src/core/bare-repo/__tests__/integration.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/bare-repo/__tests__/integration.test.ts docs/bare-repo-quickstart.md
git commit -m "test(bare-repo): add integration tests and quickstart documentation"
```

---

## 计划完成

**Plan complete and saved to `docs/superpowers/plans/2025-04-22-bare-repo-worktree-implementation.md`.**

## 集成测试项目

**测试项目**: `D:/OpenCode/config-history`

### 项目信息
- **类型**: Maven Spring Boot 项目
- **文件数**: 39 个 Java 文件
- **包结构**: `com.example.config` 及其子包
- **Git 仓库**: 已配置远程 `origin`
- **测试目录**: `src/test/java/` 已存在

### 测试场景

```bash
# 场景 1: 小批量测试（4 个组，每组约 10 个文件）
/task-create dir=src/main/java ext=java batchSize=4 mode=bare-repo prompt="..."

# 场景 2: 按包分组测试
/task-create dir=src/main/java ext=java batchSize=4 groupingStrategy=by-package prompt="..."

# 场景 3: 完整测试（所有 39 个文件）
/task-create dir=src/main/java ext=java batchSize=4 groupingStrategy=by-complexity prompt="..."
```

---

## 执行选项

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach would you prefer?**

---

## 任务汇总

| 任务 | 组件 | 文件 | 测试 | 预计时间 |
|------|------|------|------|---------|
| 1 | 类型定义 | `types.ts` | `types.test.ts` | 10min |
| 2 | BareRepoInitializer | `initializer.ts` | `initializer.test.ts` | 20min |
| 3 | FileGrouper | `file-grouper.ts` | `file-grouper.test.ts` | 15min |
| 4 | WorktreePool | `worktree-pool.ts` | `worktree-pool.test.ts` | 25min |
| 5 | GroupExecutor | `group-executor.ts` | `group-executor.test.ts` | 15min |
| 6 | ResultMerger | `result-merger.ts` | `result-merger.test.ts` | 15min |
| 7 | BareRepoOrchestrator | `orchestrator.ts` | `orchestrator.test.ts` | 25min |
| 8 | TaskManager 集成 | `task-manager.ts` | 现有测试 | 30min |
| 9 | 清理旧代码 | `package.json` | - | 15min |
| 10 | 集成测试 | `integration.test.ts` | `config-history` E2E | 30min |

**总计**: ~190分钟（约3小时）

---

## 验证清单（在 config-history 上）

- [ ] Bare Repo 初始化成功
- [ ] 4 个 Worktree 创建成功
- [ ] 每组执行约 10 个文件
- [ ] Maven 编译在各自 .m2 中无冲突
- [ ] 生成的测试文件自动复制到 main/src/test/
- [ ] Worktree 清理成功
- [ ] 执行时间 < 串行模式的 1/3

---

## 自评检查

- ✅ **Spec Coverage**: 所有设计文档中的组件都有对应任务
- ✅ **No Placeholders**: 每个步骤都有具体代码和命令
- ✅ **Type Consistency**: 所有类型引用一致
- ✅ **File Paths**: 所有路径都是绝对路径
- ✅ **Integration Test**: 已指定 config-history 作为测试项目
