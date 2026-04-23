/**
 * DTAgent OpenCode Plugin
 * 
 * Plugin 入口，导出给 OpenCode 使用
 * 
 * 使用方式：
 * 在 opencode.json 中配置：
 * {
 *   "plugin": ["@dtagent/cli"]
 * }
 */

import type { Plugin } from '@opencode-ai/plugin'
import type { Config } from '@opencode-ai/sdk'
import { DTAgentRegistry } from './registry'
import type { AgentConfig } from './types'

// 导出类型
export * from './types'
export { DTAgentRegistry }

/**
 * DTAgent Plugin 主入口
 */
const DTAgentPlugin: Plugin = async ({ client, directory, worktree, $ }) => {
  console.log('[DTAgent] Plugin loading...', { directory })

  // 创建注册中心
  const registry = new DTAgentRegistry({
    prefix: 'dtagent:',
    directory,
  })

  // 加载所有能力
  const capabilities = registry.load()
  console.log('[DTAgent] Loaded capabilities:', {
    commands: Object.keys(capabilities.commands).length,
    skills: Object.keys(capabilities.skills).length,
    tools: Object.keys(capabilities.tools).length,
  })

  // 获取 Agent 配置
  const agentConfig = registry.getAgentConfig()

  // 构建返回的 Hooks
  const hooks: any = {}

  // 1. Config Hook - 注册 Agent 和 Commands
  hooks.config = async (config: Config) => {
    console.log('[DTAgent] Config hook called')

    // 注册 dtagent agent
    if (agentConfig) {
      config.agent = config.agent || {}
      ;(config.agent as any).dtagent = {
        mode: agentConfig.mode,
        description: agentConfig.description,
        model: agentConfig.model,
        prompt: agentConfig.prompt,
        tools: agentConfig.tools,
        permission: agentConfig.permission,
      }
      console.log('[DTAgent] Registered dtagent agent')
    }

    // 注册 commands（带 dtagent: 前缀）
    config.command = config.command || {}
    for (const [name, cmd] of Object.entries(capabilities.commands)) {
      const prefixedName = `dtagent:${name}`
      ;(config.command as any)[prefixedName] = {
        description: cmd.description,
        template: cmd.content,
      }
    }
    console.log('[DTAgent] Registered', Object.keys(capabilities.commands).length, 'commands')
  }

  // 2. Event Hook - 监听会话事件
  hooks.event = async ({ event }: { event: any }) => {
    // 可以在这里处理会话创建、完成等事件
    if (event.type === 'session.created') {
      console.log('[DTAgent] Session created:', event.properties?.info?.id)
    }
  }

  // 返回 Hooks
  return hooks
}

// 默认导出
export default DTAgentPlugin
export { DTAgentPlugin }
