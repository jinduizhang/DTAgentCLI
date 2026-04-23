/**
 * Command Loader
 * 
 * 加载 templates/commands/*.md 文件
 */

import * as fs from 'fs'
import * as path from 'path'
import type { DTAgentCommand, CommandArg } from '../types'
import { parseFrontmatter } from '../utils/frontmatter'

let cachedCommands: Record<string, DTAgentCommand> | null = null
let cacheTimestamp: number = 0
const CACHE_TTL = 5000 // 5秒缓存

/**
 * 获取 commands 目录路径
 */
function getCommandsDir(): string {
  const possiblePaths = [
    path.join(__dirname, '..', '..', '..', 'templates', 'commands'),
    path.join(process.cwd(), 'templates', 'commands'),
    path.resolve(__dirname, '../../../../templates/commands'),
  ]
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  
  return possiblePaths[0]
}

/**
 * 加载所有内置 commands
 */
export function loadBuiltinCommands(): Record<string, DTAgentCommand> {
  const now = Date.now()
  
  // 使用缓存
  if (cachedCommands && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedCommands
  }
  
  const commandsDir = getCommandsDir()
  
  if (!fs.existsSync(commandsDir)) {
    console.warn(`[DTAgent] Commands directory not found: ${commandsDir}`)
    return {}
  }
  
  const commands: Record<string, DTAgentCommand> = {}
  
  try {
    const entries = fs.readdirSync(commandsDir, { withFileTypes: true })
    
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      
      const name = entry.name.replace('.md', '')
      const filePath = path.join(commandsDir, entry.name)
      
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const { data, body } = parseFrontmatter(content)
        
        // 解析参数定义
        const args = parseCommandArgs(body)
        
        commands[name] = {
          name,
          description: data.description || name,
          content: body,
          args,
          source: 'builtin',
        }
      } catch (e) {
        console.warn(`[DTAgent] Failed to load command ${name}: ${e}`)
      }
    }
  } catch (e) {
    console.error(`[DTAgent] Error loading commands: ${e}`)
  }
  
  cachedCommands = commands
  cacheTimestamp = now
  
  return commands
}

/**
 * 获取特定 command
 */
export function getCommand(name: string): DTAgentCommand | undefined {
  const commands = loadBuiltinCommands()
  return commands[name]
}

/**
 * 清除缓存
 */
export function clearCommandCache(): void {
  cachedCommands = null
  cacheTimestamp = 0
}

/**
 * 从内容中解析参数定义
 */
function parseCommandArgs(content: string): CommandArg[] | undefined {
  const args: CommandArg[] = []
  
  // 查找参数部分（中文或英文）
  const argsSection = content.match(/##\s*(?:参数|Parameters)\s*\n([\s\S]*?)(?=\n##|\n---|$)/i)
  if (!argsSection) return undefined
  
  const lines = argsSection[1].split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    
    // 匹配参数定义格式：
    // - `{name}` - description
    // - `--option` - description
    // - `name` - description
    const match = trimmed.match(/^-\s*`?\{?(\w+)\}?`?\s*-\s*(.+)$/)
    if (!match) continue
    
    const name = match[1]
    const rest = match[2]
    
    // 解析类型和描述
    let type: 'string' | 'boolean' | 'number' = 'string'
    let required = true
    let description = rest
    let defaultValue: string | boolean | number | undefined
    
    // 检查是否可选
    if (rest.includes('可选') || rest.toLowerCase().includes('optional')) {
      required = false
    }
    
    // 检查是否是选项（--开头）
    if (line.includes('--')) {
      type = 'boolean'
      required = false
      defaultValue = false
    }
    
    // 检查是否有默认值
    const defaultMatch = rest.match(/(?:默认|default)[是为:]\s*`?([^`\n]+)`?/i)
    if (defaultMatch) {
      defaultValue = parseDefaultValue(defaultMatch[1].trim())
      if (!required && defaultValue !== undefined) {
        type = inferTypeFromValue(defaultValue)
      }
    }
    
    args.push({
      name,
      type,
      description,
      required,
      default: defaultValue,
    })
  }
  
  return args.length > 0 ? args : undefined
}

/**
 * 解析默认值
 */
function parseDefaultValue(value: string): string | boolean | number | undefined {
  value = value.trim()
  
  // 布尔值
  if (value === 'true' || value === '是' || value === 'yes') return true
  if (value === 'false' || value === '否' || value === 'no') return false
  
  // 空值
  if (value === '' || value === 'null' || value === 'undefined') return undefined
  
  // 数字
  if (/^-?\d+$/.test(value)) return parseInt(value, 10)
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value)
  
  // 字符串（去除引号）
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  
  return value
}

/**
 * 从值推断类型
 */
function inferTypeFromValue(value: any): 'string' | 'boolean' | 'number' {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  return 'string'
}
