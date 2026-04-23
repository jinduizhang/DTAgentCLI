/**
 * DTAgent Registry
 * 
 * 通用注册中心，统一管理所有能力
 */

import * as fs from 'fs'
import * as path from 'path'
import type {
  RegistryConfig,
  RegistryResult,
  DTAgentCapability,
  AgentConfig,
} from './types'
import { loadBuiltinCommands, getCommand, clearCommandCache } from './loaders/command-loader'
import { loadBuiltinSkills, getSkill, clearSkillCache } from './loaders/skill-loader'
import { loadBuiltinTools, getTool, clearToolCache } from './loaders/tool-loader'
import { loadProjectExtensions } from './loaders/project-loader'
import { parseFrontmatter } from './utils/frontmatter'

export class DTAgentRegistry {
  private config: RegistryConfig
  private cache: RegistryResult | null = null
  private cacheTimestamp: number = 0
  private readonly CACHE_TTL = 5000 // 5秒缓存

  constructor(config: Partial<RegistryConfig> & { directory: string }) {
    this.config = {
      prefix: config.prefix || 'dtagent:',
      directory: config.directory,
      builtinCommandsDir: config.builtinCommandsDir || this.resolveTemplatePath('commands'),
      builtinSkillsDir: config.builtinSkillsDir || this.resolveTemplatePath('skills'),
      builtinToolsDir: config.builtinToolsDir || this.resolveTemplatePath('plugins'),
    }
  }

  /**
   * 加载所有能力
   */
  load(): RegistryResult {
    const now = Date.now()
    
    // 使用缓存
    if (this.cache && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.cache
    }

    // 1. 加载内置 commands
    const builtinCommands = loadBuiltinCommands()

    // 2. 加载内置 skills
    const builtinSkills = loadBuiltinSkills()

    // 3. 加载内置 tools
    const builtinTools = loadBuiltinTools()

    // 4. 加载项目级扩展
    const projectExtensions = loadProjectExtensions(this.config.directory, this.config.prefix)

    // 5. 合并（项目级优先级高于内置）
    const commands = { ...builtinCommands, ...projectExtensions.commands }
    const skills = { ...builtinSkills, ...projectExtensions.skills }
    const tools = { ...builtinTools, ...projectExtensions.tools }

    // 6. 构建统一映射
    const all: Record<string, DTAgentCapability> = {}

    for (const [name, cmd] of Object.entries(commands)) {
      all[name] = {
        type: 'command',
        name,
        displayName: `${this.config.prefix}${name}`,
        description: cmd.description,
        source: cmd.source,
        content: cmd.content,
      }
    }

    for (const [name, skill] of Object.entries(skills)) {
      all[name] = {
        type: 'skill',
        name,
        displayName: `${this.config.prefix}${name}`,
        description: skill.description,
        source: skill.source,
        content: skill.content,
      }
    }

    for (const [name, tool] of Object.entries(tools)) {
      all[name] = {
        type: 'tool',
        name,
        displayName: `${this.config.prefix}${name}`,
        description: tool.description,
        source: tool.source,
        definition: tool.definition,
      }
    }

    this.cache = { commands, skills, tools, all }
    this.cacheTimestamp = now

    return this.cache
  }

  /**
   * 查找能力
   * 
   * 支持多种格式：
   * - "fix-java-ut"
   * - "dtagent:fix-java-ut"
   * - "/dtagent:fix-java-ut"
   */
  find(name: string): DTAgentCapability | undefined {
    const registry = this.load()

    // 标准化名称
    const normalizedName = name
      .replace(/^dtagent:/, '')
      .replace(/^\//, '')
      .replace(/^:/, '')

    return registry.all[normalizedName]
  }

  /**
   * 获取能力列表
   */
  list(): string[] {
    const registry = this.load()
    return Object.keys(registry.all).map(name => `${this.config.prefix}${name}`)
  }

  /**
   * 获取帮助信息
   */
  getHelp(): string {
    const registry = this.load()

    const sections: string[] = [
      '# DTAgent Capabilities\n',
      `Prefix: ${this.config.prefix}\n`,
      '## Commands\n',
    ]

    // Commands
    for (const [name, cmd] of Object.entries(registry.commands)) {
      sections.push(`- **${this.config.prefix}${name}** (${cmd.source}): ${cmd.description}`)
    }

    sections.push('\n## Skills\n')

    // Skills
    for (const [name, skill] of Object.entries(registry.skills)) {
      sections.push(`- **${this.config.prefix}${name}** (${skill.source}): ${skill.description}`)
    }

    sections.push('\n## Tools\n')

    // Tools
    for (const [name, tool] of Object.entries(registry.tools)) {
      sections.push(`- **${this.config.prefix}${name}** (${tool.source}): ${tool.description}`)
    }

    sections.push(
      '\n## Usage\n',
      `Use ${this.config.prefix}<name> to invoke any capability.\n`,
      'Examples:\n',
      `  ${this.config.prefix}fix-java-ut OrderServiceTest`,
      `  ${this.config.prefix}generate-dt-single src/main/java/OrderService.java`,
      `  ${this.config.prefix}init-dt --decompile com.alibaba.*`,
    )

    return sections.join('\n')
  }

  /**
   * 获取 Agent 配置
   * 
   * 用于注册到 OpenCode 的 config.agent.dtagent
   */
  getAgentConfig(): AgentConfig | null {
    const agentPath = this.resolveAgentTemplatePath()
    if (!agentPath || !fs.existsSync(agentPath)) {
      console.warn('[DTAgent] Agent template not found')
      return null
    }

    try {
      const content = fs.readFileSync(agentPath, 'utf-8')
      const { data, body } = parseFrontmatter(content)

      return {
        mode: (data.mode as 'primary' | 'subagent' | 'all') || 'primary',
        description: data.description || 'Java unit test generator',
        prompt: body,
        tools: this.buildToolConfig(data.tools),
        permission: data.permission,
      }
    } catch (e) {
      console.error(`[DTAgent] Failed to load agent config: ${e}`)
      return null
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache = null
    this.cacheTimestamp = 0
    clearCommandCache()
    clearSkillCache()
    clearToolCache()
  }

  /**
   * 解析模板路径
   */
  private resolveTemplatePath(subdir: string): string {
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'templates', subdir),
      path.join(process.cwd(), 'templates', subdir),
      path.resolve(__dirname, '../../../templates', subdir),
    ]

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p
      }
    }

    return possiblePaths[0]
  }

  /**
   * 解析 agent 模板路径
   */
  private resolveAgentTemplatePath(): string | null {
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'templates', 'agents', 'dtagent.md'),
      path.join(process.cwd(), 'templates', 'agents', 'dtagent.md'),
      path.resolve(__dirname, '../../../templates/agents/dtagent.md'),
    ]

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p
      }
    }

    return null
  }

  /**
   * 构建工具配置
   */
  private buildToolConfig(toolsData: any): Record<string, boolean> | undefined {
    if (!toolsData || typeof toolsData !== 'object') {
      return undefined
    }

    const tools: Record<string, boolean> = {}
    
    for (const [key, value] of Object.entries(toolsData)) {
      if (typeof value === 'boolean') {
        tools[key] = value
      } else if (value === 'true') {
        tools[key] = true
      } else if (value === 'false') {
        tools[key] = false
      }
    }

    return Object.keys(tools).length > 0 ? tools : undefined
  }
}

// 导出单例创建函数
export function createRegistry(directory: string): DTAgentRegistry {
  return new DTAgentRegistry({ directory })
}

export { RegistryConfig, RegistryResult, DTAgentCapability }
