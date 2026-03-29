import type { Plugin } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"

// 日志目录
const LOG_DIR = '.dtagent/logs'
const LOG_FILE = 'telemetry-plugin.log'

// 覆盖率数据结构
interface CoverageData {
  lineCoverage: number | null;
  branchCoverage: number | null;
}

// 测试结果数据结构
interface TestResultData {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  successRate: number;
}

// 遥测上报数据结构
interface TelemetryPayload {
  sessionId: string;
  timestamp: string;
  projectName: string;
  generatedTestClasses: string[];
  testStats: TestResultData | null;
  coverage: CoverageData | null;
}

/**
 * 写入日志到文件
 */
function log(directory: string, message: string, data?: any): void {
  try {
    const logDir = path.join(directory, LOG_DIR)
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    
    const logPath = path.join(logDir, LOG_FILE)
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`
    
    fs.appendFileSync(logPath, logLine)
  } catch {
    // 忽略日志写入失败
  }
}

/**
 * 发送遥测数据到远程服务
 */
async function sendTelemetry(payload: TelemetryPayload): Promise<boolean> {
  const TELEMETRY_API_URL = 'http://localhost:3000/api/telemetry'
  
  try {
    const response = await fetch(TELEMETRY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * 获取项目名
 */
function getProjectName(directory: string): string {
  return path.basename(directory)
}

/**
 * 从 session.info.summary.diffs 提取测试文件
 */
function extractTestFilesFromSummary(summary: any): string[] {
  if (!summary || !summary.diffs || !Array.isArray(summary.diffs)) {
    return []
  }
  
  return summary.diffs
    .map((d: any) => d.file)
    .filter((f: string) => f && f.includes('src/test/java') && f.endsWith('.java'))
}

/**
 * 从测试文件路径提取测试类名
 */
function extractTestClassNames(testFiles: string[]): string[] {
  return testFiles.map(f => path.basename(f, '.java'))
}

/**
 * 执行指定测试类的测试
 */
function runMavenTestForClasses(directory: string, testClassNames: string[]): TestResultData | null {
  try {
    const testParam = testClassNames.join(',')
    const mvnCmd = `mvn test -Dtest=${testParam} -q`
    
    try {
      execSync(mvnCmd, { 
        cwd: directory, 
        stdio: 'pipe',
        timeout: 300000
      })
    } catch {
      // 测试失败也继续解析报告
    }
    
    return parseSurefireReports(directory, testClassNames)
  } catch {
    return null
  }
}

/**
 * 解析指定测试类的 Surefire XML 报告
 */
function parseSurefireReports(directory: string, testClassNames: string[]): TestResultData | null {
  try {
    const surefireDir = path.join(directory, 'target', 'surefire-reports')
    
    if (!fs.existsSync(surefireDir)) {
      return null
    }
    
    let total = 0
    let success = 0
    let failed = 0
    let skipped = 0
    
    for (const testClass of testClassNames) {
      const xmlFile = `TEST-${testClass}.xml`
      const xmlPath = path.join(surefireDir, xmlFile)
      
      if (!fs.existsSync(xmlPath)) {
        continue
      }
      
      const content = fs.readFileSync(xmlPath, 'utf-8')
      
      const testsMatch = content.match(/tests="(\d+)"/)
      const failuresMatch = content.match(/failures="(\d+)"/)
      const errorsMatch = content.match(/errors="(\d+)"/)
      const skippedMatch = content.match(/skipped="(\d+)"/)
      
      if (testsMatch) {
        const tests = parseInt(testsMatch[1], 10)
        const failures = parseInt(failuresMatch?.[1] || '0', 10)
        const errors = parseInt(errorsMatch?.[1] || '0', 10)
        const skip = parseInt(skippedMatch?.[1] || '0', 10)
        
        total += tests
        failed += failures + errors
        skipped += skip
        success += tests - failures - errors - skip
      }
    }
    
    if (total === 0) {
      return null
    }
    
    const successRate = total > 0 ? Math.round((success / total) * 100) : 0
    
    return { total, success, failed, skipped, successRate }
  } catch {
    return null
  }
}

/**
 * 解析 JaCoCo XML 覆盖率报告
 */
function parseJacocoXml(directory: string): CoverageData | null {
  try {
    const jacocoPath = path.join(directory, 'target', 'site', 'jacoco', 'jacoco.xml')
    
    if (!fs.existsSync(jacocoPath)) {
      return null
    }
    
    const content = fs.readFileSync(jacocoPath, 'utf-8')
    
    const lineRegex = /counter type="LINE" missed="(\d+)" covered="(\d+)"/g
    let lineMissed = 0
    let lineCovered = 0
    let match
    
    while ((match = lineRegex.exec(content)) !== null) {
      lineMissed += parseInt(match[1], 10)
      lineCovered += parseInt(match[2], 10)
    }
    
    const branchRegex = /counter type="BRANCH" missed="(\d+)" covered="(\d+)"/g
    let branchMissed = 0
    let branchCovered = 0
    
    while ((match = branchRegex.exec(content)) !== null) {
      branchMissed += parseInt(match[1], 10)
      branchCovered += parseInt(match[2], 10)
    }
    
    const lineTotal = lineMissed + lineCovered
    const branchTotal = branchMissed + branchCovered
    
    return {
      lineCoverage: lineTotal > 0 ? Math.round((lineCovered / lineTotal) * 100) : null,
      branchCoverage: branchTotal > 0 ? Math.round((branchCovered / branchTotal) * 100) : null
    }
  } catch {
    return null
  }
}

export const TelemetryPlugin: Plugin = async ({ client, directory }) => {
  log(directory, 'Plugin initialized', { directory })
  
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const sessionId = (event.properties as any)?.sessionID || 'unknown'
        
        log(directory, 'Session idle event', { sessionId })
        
        // 通过 client API 获取 session 信息
        let sessionInfo: any = null
        try {
          const result = await client.session.get({ path: { id: sessionId } })
          sessionInfo = result.data
          log(directory, 'Session info retrieved', { 
            hasSummary: !!sessionInfo?.summary,
            summary: sessionInfo?.summary,
            fullSession: JSON.stringify(sessionInfo).substring(0, 3000)
          })
        } catch (err) {
          log(directory, 'Failed to get session info', { error: String(err) })
          return
        }
        
        // 从 summary.diffs 提取测试文件
        const testFiles = extractTestFilesFromSummary(sessionInfo?.summary)
        log(directory, 'Test files from summary.diffs', { testFiles })
        
        // 如果没有测试文件，跳过
        if (testFiles.length === 0) {
          log(directory, 'No test files found in summary.diffs')
          return
        }
        
        // 提取测试类名
        const testClassNames = extractTestClassNames(testFiles)
        log(directory, 'Test class names', { testClassNames })
        
        // 执行测试
        const testStats = runMavenTestForClasses(directory, testClassNames)
        log(directory, 'Test stats', { testStats })
        
        // 解析覆盖率
        const coverageData = parseJacocoXml(directory)
        log(directory, 'Coverage', { coverageData })
        
        // 组装上报数据
        const payload: TelemetryPayload = {
          sessionId,
          timestamp: new Date().toISOString(),
          projectName: getProjectName(directory),
          generatedTestClasses: testClassNames,
          testStats,
          coverage: coverageData,
        }
        
        log(directory, 'Sending telemetry', { payload })
        
        // 上报
        const success = await sendTelemetry(payload)
        log(directory, 'Telemetry sent', { success })
      }
    },
  }
}

export default TelemetryPlugin