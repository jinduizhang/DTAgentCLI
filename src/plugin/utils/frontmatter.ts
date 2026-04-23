/**
 * YAML Frontmatter Parser
 * 
 * 解析 Markdown 文件中的 YAML frontmatter
 */

export interface FrontmatterResult {
  data: Record<string, any>
  body: string
}

/**
 * 解析 frontmatter
 * 支持格式:
 * ---
 * key: value
 * key2: value2
 * ---
 * body content
 */
export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  
  if (!match) {
    return { data: {}, body: content }
  }
  
  const frontmatter = match[1]
  const body = match[2]
  const data: Record<string, any> = {}
  
  let currentKey: string | null = null
  let currentObject: Record<string, any> | null = null
  
  for (const line of frontmatter.split('\n')) {
    const trimmedLine = line.trim()
    
    // 跳过空行和注释
    if (!trimmedLine || trimmedLine.startsWith('#')) continue
    
    // 检查是否是嵌套对象的开始
    if (!line.startsWith('  ') && line.includes(':')) {
      const colonIndex = line.indexOf(':')
      const key = line.substring(0, colonIndex).trim()
      const value = line.substring(colonIndex + 1).trim()
      
      // 如果值是空的，可能是嵌套对象的开始
      if (value === '') {
        currentKey = key
        currentObject = {}
        data[key] = currentObject
      } else {
        // 普通键值对
        currentKey = null
        currentObject = null
        data[key] = parseValue(value)
      }
    } else if (line.startsWith('  ') && currentObject && currentKey) {
      // 嵌套对象的属性
      const colonIndex = line.trim().indexOf(':')
      if (colonIndex > 0) {
        const nestedKey = line.trim().substring(0, colonIndex).trim()
        const nestedValue = line.trim().substring(colonIndex + 1).trim()
        currentObject[nestedKey] = parseValue(nestedValue)
      }
    }
  }
  
  return { data, body }
}

/**
 * 解析值
 */
function parseValue(value: string): any {
  value = value.trim()
  
  // 布尔值
  if (value === 'true') return true
  if (value === 'false') return false
  
  // null
  if (value === 'null' || value === '~') return null
  
  // 数字
  if (/^-?\d+$/.test(value)) return parseInt(value, 10)
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value)
  
  // 数组
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1)
    if (!inner.trim()) return []
    return inner.split(',').map(v => parseValue(v.trim()))
  }
  
  // 字符串（去除引号）
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  
  return value
}

/**
 * 解析嵌套对象（简化版）
 */
function parseNestedObject(frontmatter: string, parentKey: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = frontmatter.split('\n')
  
  let inBlock = false
  for (const line of lines) {
    if (line.startsWith(`${parentKey}:`)) {
      inBlock = true
      continue
    }
    
    if (inBlock) {
      if (!line.startsWith('  ')) break
      
      const colonIndex = line.trim().indexOf(':')
      if (colonIndex > 0) {
        const key = line.trim().substring(0, colonIndex).trim()
        const value = line.trim().substring(colonIndex + 1).trim()
        result[key] = value
      }
    }
  }
  
  return result
}
