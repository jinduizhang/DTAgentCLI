/**
 * Tool Loader
 * 
 * 加载 templates/plugins/*.ts 文件
 */

import * as fs from 'fs'
import * as path from 'path'
import type { DTAgentTool } from '../types'

let cachedTools: Record<string, DTAgentTool> | null = null
let cacheTimestamp: number = 0
const CACHE_TTL = 5000 // 5秒缓存

/**
 * 获取 tools 目录路径
 */
function getToolsDir(): string {
  const possiblePaths = [
    path.join(__dirname, '..', '..', '..', 'templates', 'plugins'),
    path.join(process.cwd(), 'templates', 'plugins'),
    path.resolve(__dirname, '../../../../templates/plugins'),
  ]
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  
  return possiblePaths[0]
}

/**
 * 加载所有内置 tools
 * 
 * 注意：tools 是 TypeScript 文件，需要编译后才能使用。
 * 在 OpenCode 插件环境中，这些文件会被自动编译。
 */
export function loadBuiltinTools(): Record<string, DTAgentTool> {
  const now = Date.now()
  
  // 使用缓存
  if (cachedTools && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedTools
  }
  
  const toolsDir = getToolsDir()
  
  if (!fs.existsSync(toolsDir)) {
    console.warn(`[DTAgent] Tools directory not found: ${toolsDir}`)
    return {}
  }
  
  const tools: Record<string, DTAgentTool> = {}
  
  try {
    const entries = fs.readdirSync(toolsDir, { withFileTypes: true })
    
    for (const entry of entries) {
      if (!entry.isFile()) continue
      
      // 只处理 .ts 和 .js 文件
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue
      
      // 跳过 .d.ts 文件
      if (entry.name.endsWith('.d.ts')) continue
      
      const name = entry.name.replace(/\.(ts|js)$/, '')
      const filePath = path.join(toolsDir, entry.name)
      
      try {
        // 尝试从文件内容提取描述
        const content = fs.readFileSync(filePath, 'utf-8')
        const description = extractDescription(content) || name
        
        // Tool 定义会在运行时被加载
        // 这里只记录元信息
        tools[name] = {
          name,
          description,
          definition: null as any, // 占位，实际定义在运行时加载
          source: 'builtin',
        }
      } catch (e) {
        console.warn(`[DTAgent] Failed to load tool ${name}: ${e}`)
      }
    }
  } catch (e) {
    console.error(`[DTAgent] Error loading tools: ${e}`)
  }
  
  cachedTools = tools
  cacheTimestamp = now
  
  return tools
}

/**
 * 获取特定 tool
 */
export function getTool(name: string): DTAgentTool | undefined {
  const tools = loadBuiltinTools()
  return tools[name]
}

/**
 * 清除缓存
 */
export function clearToolCache(): void {
  cachedTools = null
  cacheTimestamp = 0
}

/**
 * 从文件内容提取描述
 */
function extractDescription(content: string): string | null {
  // 尝试匹配 JSDoc 注释
  const jsdocMatch = content.match(/\/\*\*\s*\n?\s*\*\s*(.+?)\n/)
  if (jsdocMatch) {
    return jsdocMatch[1].trim()
  }
  
  // 尝试匹配 description 字段
  const descMatch = content.match(/description:\s*["']([^"']+)["']/)
  if (descMatch) {
    return descMatch[1]
  }
  
  // 尝试匹配工具名称注释
  const commentMatch = content.match(/\/\/\s*(.+)/)
  if (commentMatch) {
    return commentMatch[1].trim()
  }
  
  return null
}

/**
 * 获取 tool 文件路径
 */
export function getToolPath(name: string): string | null {
  const toolsDir = getToolsDir()
  
  // 优先返回 .ts 文件
  const tsPath = path.join(toolsDir, `${name}.ts`)
  if (fs.existsSync(tsPath)) {
    return tsPath
  }
  
  // 其次返回 .js 文件
  const jsPath = path.join(toolsDir, `${name}.js`)
  if (fs.existsSync(jsPath)) {
    return jsPath
  }
  
  return null
}

/**
 * 动态加载 tool 模块
 * 
 * 注意：这个函数只能在运行时调用，不能在 plugin 初始化时调用
 */
export async function loadToolModule(name: string): Promise<any> {
  const toolPath = getToolPath(name)
  if (!toolPath) {
    throw new Error(`Tool ${name} not found`)
  }
  
  try {
    // 动态导入模块
    const module = await import(toolPath)
    return module
  } catch (e) {
    throw new Error(`Failed to load tool ${name}: ${e}`)
  }
}
