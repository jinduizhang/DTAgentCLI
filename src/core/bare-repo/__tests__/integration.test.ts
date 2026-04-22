import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { BareRepoInitializer } from '../initializer';
import { FileGrouper, GroupingStrategy } from '../file-grouper';
import { WorktreePool } from '../worktree-pool';
import { BareRepoOrchestrator } from '../orchestrator';
import { FileResult, WorktreeConfig } from '../types';

/**
 * Bare Repo Worktree 集成测试
 * 
 * 测试场景：
 * 1. Bare Repo 初始化
 * 2. Worktree 创建与销毁
 * 3. 文件分组策略
 * 4. 并行执行流程
 */
describe('Bare Repo Worktree Integration', () => {
  const testDir = path.join(process.cwd(), '.test-bare-repo-integration');
  
  beforeAll(() => {
    // 创建测试 Git 仓库
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    
    fs.mkdirSync(testDir, { recursive: true });
    
    // 初始化 Git 仓库
    execSync('git init', { cwd: testDir, stdio: 'pipe' });
    execSync('git remote add origin https://github.com/test/test.git', { cwd: testDir, stdio: 'pipe' });
    
    // 创建项目文件
    fs.writeFileSync(path.join(testDir, 'pom.xml'), '<project><modelVersion>4.0.0</modelVersion></project>');
    fs.mkdirSync(path.join(testDir, 'src', 'main', 'java', 'com', 'test'), { recursive: true });
    
    // 创建一些 Java 文件
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(
        path.join(testDir, 'src', 'main', 'java', 'com', 'test', `Service${i}.java`),
        `package com.test; public class Service${i} {}`
      );
    }
    
    // 初始提交
    execSync('git add .', { cwd: testDir, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: testDir, stdio: 'pipe' });
  });
  
  afterAll(() => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });
  
  describe('BareRepoInitializer', () => {
    it('should detect non-bare repository', () => {
      const initializer = new BareRepoInitializer(testDir);
      expect(initializer.isBareRepo()).toBe(false);
    });
    
    it('should validate clean repository', () => {
      const initializer = new BareRepoInitializer(testDir);
      const result = initializer.validate();
      expect(result.valid).toBe(true);
    });
    
    it('should initialize bare repository', async () => {
      const initializer = new BareRepoInitializer(testDir);
      const result = await initializer.initialize();
      
      expect(result.success).toBe(true);
      expect(result.barePath).toBeDefined();
      expect(result.mainWorktreePath).toBeDefined();
      
      // 验证结构
      expect(fs.existsSync(result.barePath!)).toBe(true);
      expect(fs.existsSync(result.mainWorktreePath!)).toBe(true);
      expect(initializer.isBareRepo()).toBe(true);
      
      // 验证 .git 文件
      const gitFile = path.join(testDir, '.git');
      expect(fs.existsSync(gitFile)).toBe(true);
      const gitContent = fs.readFileSync(gitFile, 'utf8');
      expect(gitContent).toContain('gitdir');
    });
    
    it('should return existing bare repo info on second call', async () => {
      const initializer = new BareRepoInitializer(testDir);
      // 第二次调用应直接返回
      const result = await initializer.initialize();
      expect(result.success).toBe(true);
      
      const info = initializer.getInfo();
      expect(info).not.toBeNull();
      expect(info?.barePath).toContain('.bare');
    });
  });
  
  describe('FileGrouper', () => {
    it('should group files using round-robin strategy', () => {
      const files = Array.from({ length: 10 }, (_, i) => `Service${i}.java`);
      const groups = FileGrouper.group(files, 4, GroupingStrategy.ROUND_ROBIN);
      
      expect(groups.length).toBe(4);
      expect(groups[0].files.length).toBe(3); // 10 files / 4 groups = 2.5, so 3, 3, 2, 2
      expect(groups.every(g => g.status === 'pending')).toBe(true);
    });
    
    it('should handle small file count', () => {
      const files = ['Service0.java', 'Service1.java'];
      const groups = FileGrouper.group(files, 4, GroupingStrategy.ROUND_ROBIN);
      
      expect(groups.length).toBe(2); // 只有 2 个文件，最多 2 个组
    });
    
    it('should group files using by-package strategy', () => {
      const files = [
        'src/main/java/com/test/Service0.java',
        'src/main/java/com/test/Service1.java',
        'src/main/java/com/util/Util0.java'
      ];
      const groups = FileGrouper.group(files, 2, GroupingStrategy.BY_PACKAGE);
      
      expect(groups.length).toBeGreaterThan(0);
      // 同包的文件应在同一组
    });
  });
  
  describe('WorktreePool', () => {
    it('should create worktree for group', async () => {
      const pool = new WorktreePool(testDir);
      const worktree = await pool.createGroupWorktree(0);
      
      expect(worktree.id).toContain('group-0');
      expect(worktree.branch).toContain('agent-group-0');
      expect(fs.existsSync(worktree.path)).toBe(true);
      expect(fs.existsSync(worktree.m2Path)).toBe(true);
      
      // 验证软链接
      const srcLink = path.join(worktree.path, 'src');
      const pomLink = path.join(worktree.path, 'pom.xml');
      expect(fs.existsSync(srcLink)).toBe(true);
      expect(fs.existsSync(pomLink)).toBe(true);
    });
    
    it('should list worktrees', async () => {
      const pool = new WorktreePool(testDir);
      await pool.createGroupWorktree(0);
      await pool.createGroupWorktree(1);
      
      const worktrees = pool.listWorktrees();
      expect(worktrees.length).toBe(2);
    });
    
    it('should destroy worktree', async () => {
      const pool = new WorktreePool(testDir);
      const worktree = await pool.createGroupWorktree(2);
      
      await pool.destroyWorktree(worktree.id);
      
      const remaining = pool.listWorktrees();
      expect(remaining.find(w => w.id === worktree.id)).toBeUndefined();
    });
    
    it('should destroy all worktrees', async () => {
      const pool = new WorktreePool(testDir);
      await pool.createGroupWorktree(3);
      await pool.createGroupWorktree(4);
      
      await pool.destroyAll();
      
      const remaining = pool.listWorktrees();
      expect(remaining.length).toBe(0);
    });
  });
  
  describe('BareRepoOrchestrator', () => {
    it('should execute files in parallel', async () => {
      const orchestrator = new BareRepoOrchestrator({
        projectRoot: testDir,
        batchSize: 2,
        groupingStrategy: 'round-robin',
        autoCleanup: true,
        timeout: 60000
      });
      
      const files = [
        'src/main/java/com/test/Service0.java',
        'src/main/java/com/test/Service1.java',
        'src/main/java/com/test/Service2.java',
        'src/main/java/com/test/Service3.java'
      ];
      
      const mockExecuteFn = async (file: string, worktree: WorktreeConfig): Promise<FileResult> => {
        // 验证 Worktree 存在
        expect(fs.existsSync(worktree.path)).toBe(true);
        
        return {
          filename: file,
          success: true,
          duration: 100
        };
      };
      
      const results = await orchestrator.execute(files, mockExecuteFn);
      
      expect(results.length).toBe(2); // 2 groups
      expect(results.every(r => r.allSuccess)).toBe(true);
    });
    
    it('should track execution status', async () => {
      const orchestrator = new BareRepoOrchestrator({
        projectRoot: testDir,
        batchSize: 2,
        groupingStrategy: 'round-robin',
        autoCleanup: false,
        timeout: 60000
      });
      
      const files = ['src/main/java/com/test/Service4.java'];
      
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
    
    it('should handle execution errors', async () => {
      const orchestrator = new BareRepoOrchestrator({
        projectRoot: testDir,
        batchSize: 1,
        groupingStrategy: 'round-robin',
        autoCleanup: true,
        timeout: 60000
      });
      
      const files = ['src/main/java/com/test/Service5.java'];
      
      const mockExecuteFn = async (file: string, worktree: WorktreeConfig): Promise<FileResult> => ({
        filename: file,
        success: false,
        error: 'Mock execution error'
      });
      
      const results = await orchestrator.execute(files, mockExecuteFn);
      
      expect(results[0].allSuccess).toBe(false);
      expect(results[0].fileResults[0].success).toBe(false);
    });
  });
});