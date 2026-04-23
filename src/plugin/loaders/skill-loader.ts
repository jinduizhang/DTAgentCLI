/**
 * Skill Loader
 * 
 * Load templates skills SKILL.md files
 */

import * as fs from "fs"
import * as path from "path"
import type { DTAgentSkill, SkillMetadata } from "../types"
import { parseFrontmatter } from "../utils/frontmatter"

let cachedSkills: Record<string, DTAgentSkill> | null = null
let cacheTimestamp: number = 0
const CACHE_TTL = 5000

function getSkillsDir(): string {
  const possiblePaths = [
    path.join(__dirname, "..", "..", "..", "templates", "skills"),
    path.join(process.cwd(), "templates", "skills"),
    path.resolve(__dirname, "../../../../templates/skills"),
  ]
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  
  return possiblePaths[0]
}

export function loadBuiltinSkills(): Record<string, DTAgentSkill> {
  return {}
}

export function getSkill(name: string): DTAgentSkill | undefined {
  return undefined
}

export function clearSkillCache(): void {
  cachedSkills = null
  cacheTimestamp = 0
}

