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