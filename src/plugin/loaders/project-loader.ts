/**
 * Project Extension Loader
 * 
 * 加载项目级扩展：.opencode/ 目录下的用户自定义能力
 */

import * as fs from 'fs'
import * as path from 'path'
import type { DTAgentCommand, DTAgentSkill, DTAgentTool } from '../types'
import { parseFrontmatter } from '../utils/frontmatter'

/**
 * 加载项目级扩展
 */
export function loadProjectExtensions(
  projectDir: string,
  prefix: string = 'dtagent:'
): {
  commands: Record<string, DTAgentCommand>
  skills: Record<string, DTAgentSkill>
  tools: Record<string, DTAgentTool>
} {
  const opencodeDir = path.join(projectDir, '.opencode')
  
  if (!fs.existsSync(opencodeDir)) {
    return { commands: {}, skills: {}, tools: {} }
  }
  
  const commands: Record<string, DTAgentCommand> = {}
  const skills: Record<string, DTAgentSkill> = {}
  const tools: Record<string, DTAgentTool> = {}
  
  // 加载项目级 commands
  const commandsDir = path.join(opencodeDir, 'commands')
  if (fs.existsSync(commandsDir)) {
    const projectCommands = loadCommandsFromDir(commandsDir, prefix)
    Object.assign(commands, projectCommands)
  }
  
  // 加载项目级 skills
  const skillsDir = path.join(opencodeDir, 'skills')
  if (fs.existsSync(skillsDir)) {
    const projectSkills = loadSkillsFromDir(skillsDir, prefix)
    Object.assign(skills, projectSkills)
  }
  
  // 加载项目级 tools/plugins
  const pluginsDir = path.join(opencodeDir, 'plugins')
  if (fs.existsSync(pluginsDir)) {
    const projectTools = loadToolsFromDir(pluginsDir, prefix)
    Object.assign(tools, projectTools)
  }
  
  return { commands, skills, tools }
}

/**
 * 从目录加载 commands
 */
function loadCommandsFromDir(
  dir: string,
  prefix: string
): Record<string, DTAgentCommand> {
  const commands: Record<string, DTAgentCommand> = {}
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      
      const rawName = entry.name.replace('.md', '')
      
      // 支持两种命名：dtagent-xxx 或 xxx
      const name = rawName.startsWith('dtagent-')
        ? rawName.replace('dtagent-', '')
        : rawName
      
      const filePath = path.join(dir, entry.name)
      
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const { data, body } = parseFrontmatter(content)
        
        commands[name] = {
          name,
          description: data.description || name,
          content: body,
          source: 'project',
        }
      } catch (e) {
        console.warn(`[DTAgent] Failed to load project command ${name}: ${e}`)
      }
    }
  } catch (e) {
    console.warn(`[DTAgent] Error loading project commands: ${e}`)
  }
  
  return commands
}

/**
 * 从目录加载 skills
 */
function loadSkillsFromDir(
  dir: string,
  prefix: string
): Record<string, DTAgentSkill> {
  const skills: Record<string, DTAgentSkill> = {}
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      
      const rawName = entry.name
      
      // 支持两种命名：dtagent-xxx 或 xxx
      const name = rawName.startsWith('dtagent-')
        ? rawName.replace('dtagent-', '')
        : rawName
      
      const skillPath = path.join(dir, entry.name, 'SKILL.md')
      
      if (!fs.existsSync(skillPath)) continue
      
      try {
        const content = fs.readFileSync(skillPath, 'utf-8')
        const { data, body } = parseFrontmatter(content)
        
        // 加载 experiences
        const experiencesDir = path.join(dir, entry.name, 'experiences')
        const experiences: { name: string; content: string }[] = []
        
        if (fs.existsSync(experiencesDir)) {
          const expEntries = fs.readdirSync(experiencesDir, { withFileTypes: true })
          for (const expEntry of expEntries) {
            if (!expEntry.isFile() || !expEntry.name.endsWith('.md')) continue
            if (expEntry.name === 'README.md' || expEntry.name === 'template.md') continue
            
            const expPath = path.join(experiencesDir, expEntry.name)
            try {
              const expContent = fs.readFileSync(expPath, 'utf-8')
              experiences.push({
                name: expEntry.name.replace('.md', ''),
                content: expContent.trim(),
              })
            } catch {
              // 忽略单个 experience 加载失败
            }
          }
        }
        
        // 合并 experiences
        let fullContent = body
        if (experiences.length > 0) {
          fullContent += '\n\n---\n\n## 经验库\n\n'
          for (const exp of experiences) {
            fullContent += `### ${exp.name}\n\n${exp.content}\n\n`
          }
        }
        
        skills[name] = {
          name,
          description: data.description || data.name || name,
          content: fullContent,
          source: 'project',
        }
      } catch (e) {
        console.warn(`[DTAgent] Failed to load project skill ${name}: ${e}`)
      }
    }
  } catch (e) {
    console.warn(`[DTAgent] Error loading project skills: ${e}`)
  }
  
  return skills
}

/**
 * 从目录加载 tools
 */
function loadToolsFromDir(
  dir: string,
  prefix: string
): Record<string, DTAgentTool> {
  const tools: Record<string, DTAgentTool> = {}
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      if (!entry.isFile()) continue
      
      // 只处理 .ts 和 .js 文件
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue
      
      // 跳过 .d.ts 文件
      if (entry.name.endsWith('.d.ts')) continue
      
      const rawName = entry.name.replace(/\.(ts|js)$/, '')
      
      // 支持两种命名：dtagent-xxx 或 xxx
      const name = rawName.startsWith('dtagent-')
        ? rawName.replace('dtagent-', '')
        : rawName
      
      const filePath = path.join(dir, entry.name)
      
      try {
        // 尝试从文件内容提取描述
        const content = fs.readFileSync(filePath, 'utf-8')
        const description = extractDescription(content) || name
        
        // Tool 定义会在运行时被加载
        tools[name] = {
          name,
          description,
          definition: null as any, // 占位
          source: 'project',
        }
      } catch (e) {
        console.warn(`[DTAgent] Failed to load project tool ${name}: ${e}`)
      }
    }
  } catch (e) {
    console.warn(`[DTAgent] Error loading project tools: ${e}`)
  }
  
  return tools
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
