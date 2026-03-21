/**
 * Report generator - Generate test reports
 */

import * as fs from 'fs';
import * as path from 'path';
import { GenerateResult } from '../commands/generate';

export interface ReportData {
  timestamp: string;
  command: string;
  files: ReportFile[];
  summary: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
  };
}

export interface ReportFile {
  source: string;
  test?: string;
  status: 'success' | 'failed' | 'skipped';
  message?: string;
}

/**
 * Generate JSON report
 */
export function generateJsonReport(results: GenerateResult[], command: string): string {
  const report: ReportData = {
    timestamp: new Date().toISOString(),
    command,
    files: results.map(r => ({
      source: r.source,
      test: r.test,
      status: r.status,
      message: r.message,
    })),
    summary: {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
    },
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Generate Markdown report
 */
export function generateMarkdownReport(results: GenerateResult[], command: string): string {
  const date = new Date().toISOString().split('T')[0];
  const success = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  let md = `# DTAgent Test Generation Report

**Date**: ${date}
**Command**: \`${command}\`

## Summary

| Metric | Count |
|--------|-------|
| Total | ${results.length} |
| ✅ Success | ${success} |
| ❌ Failed | ${failed} |
| ⏭️ Skipped | ${skipped} |

`;

  if (results.length > 0) {
    md += `## Files\n\n`;
    md += `| Source | Status | Message |\n`;
    md += `|--------|--------|--------|\n`;

    for (const r of results) {
      const statusIcon = r.status === 'success' ? '✅' : r.status === 'failed' ? '❌' : '⏭️';
      md += `| ${r.source} | ${statusIcon} ${r.status} | ${r.message || '-'} |\n`;
    }
  }

  return md;
}

/**
 * Save reports to files
 */
export function saveReports(results: GenerateResult[], command: string, projectDir: string): void {
  const reportsDir = path.join(projectDir, '.dtagent', 'reports');
  const logsDir = path.join(projectDir, '.dtagent', 'logs');

  // Create directories if not exist
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Generate timestamp for filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // Save JSON report
  const jsonPath = path.join(reportsDir, `ut-report-${timestamp}.json`);
  fs.writeFileSync(jsonPath, generateJsonReport(results, command));

  // Save Markdown report
  const mdPath = path.join(reportsDir, `ut-report-${timestamp}.md`);
  fs.writeFileSync(mdPath, generateMarkdownReport(results, command));

  // Also save as latest
  fs.writeFileSync(path.join(reportsDir, 'ut-report.json'), generateJsonReport(results, command));
  fs.writeFileSync(path.join(reportsDir, 'ut-report.md'), generateMarkdownReport(results, command));

  // Save log
  const logPath = path.join(logsDir, `${new Date().toISOString().split('T')[0]}.log`);
  const logContent = `[${new Date().toISOString()}] ${command}\n` +
    `Total: ${results.length}, Success: ${results.filter(r => r.status === 'success').length}, ` +
    `Failed: ${results.filter(r => r.status === 'failed').length}\n\n`;
  
  fs.appendFileSync(logPath, logContent);
}