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