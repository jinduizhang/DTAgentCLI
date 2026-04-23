/**
 * DTAgent Plugin Types
 * 
 * 类型定义文件
 */

import type { ToolDefinition } from "@opencode-ai/plugin"

// Command 参数定义
export interface CommandArg {
  name: string
  type: 'string' | 'boolean' | 'number'
  description?: string
  required?: boolean
  default?: string | boolean | number
}

// Command 定义
export interface DTAgentCommand {
  name: string
  description: string
  content: string
  args?: CommandArg[]
  source: 'builtin' | 'project' | 'user'
}

// Skill 元数据
export interface SkillMetadata {
  language?: string
  framework?: string
  type?: string
  compatibility?: string
}

// Skill 定义
export interface DTAgentSkill {
  name: string
  description: string
  content: string
  metadata?: SkillMetadata
  source: 'builtin' | 'project' | 'user'
}

// Tool 定义
export interface DTAgentTool {
  name: string
  description: string
  definition: ToolDefinition
  source: 'builtin' | 'project' | 'user'
}

// Registry 配置
export interface RegistryConfig {
  prefix: string
  directory: string
  builtinCommandsDir: string
  builtinSkillsDir: string
  builtinToolsDir: string
}

// Registry 结果
export interface RegistryResult {
  commands: Record<string, DTAgentCommand>
  skills: Record<string, DTAgentSkill>
  tools: Record<string, DTAgentTool>
  all: Record<string, DTAgentCapability>
}

// 统一能力接口
export interface DTAgentCapability {
  type: 'command' | 'skill' | 'tool'
  name: string
  displayName: string
  description: string
  source: 'builtin' | 'project' | 'user'
  execute?: (args: any, context: any) => Promise<string>
  content?: string
  definition?: ToolDefinition
}

// Agent 配置（用于 config hook）
export interface AgentConfig {
  mode: 'primary' | 'subagent' | 'all'
  description: string
  model?: string
  prompt?: string
  tools?: Record<string, boolean | { allowed: boolean; pathValidator?: (path: string) => boolean }>
  rules?: string[]
  color?: string
  maxSteps?: number
  permission?: {
    edit?: 'ask' | 'allow' | 'deny'
    bash?: 'ask' | 'allow' | 'deny' | Record<string, 'ask' | 'allow' | 'deny'>
    [key: string]: any
  }
}
