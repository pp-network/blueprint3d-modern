import { AI_FLOORPLAN_SKILL_PACK } from './ai-floorplan-skill-pack'
import { AI_WALLS_SYSTEM_PROMPT, AI_WALLS_USER_PROMPT } from './ai-walls-prompt'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(AI_WALLS_SYSTEM_PROMPT.includes('简体中文'), 'think in Chinese')
assert(AI_WALLS_SYSTEM_PROMPT.includes(AI_FLOORPLAN_SKILL_PACK), 'skill pack inlined')
assert(AI_FLOORPLAN_SKILL_PACK.includes('outerLoop'), 'wall skill')
assert(AI_FLOORPLAN_SKILL_PACK.includes('客厅'), 'room skill')
assert(AI_FLOORPLAN_SKILL_PACK.includes('bed'), 'furniture skill')
assert(AI_FLOORPLAN_SKILL_PACK.includes('衣帽间'), 'closet is not a wall')
assert(AI_FLOORPLAN_SKILL_PACK.includes('拐弯'), 'keep facade jogs')
assert(AI_FLOORPLAN_SKILL_PACK.includes('目标效果'), 'gold-standard target')
assert(AI_FLOORPLAN_SKILL_PACK.includes('门洞'), 'door gaps')
assert(AI_WALLS_USER_PROMPT(18670).includes('18670'), 'user width')
assert(AI_WALLS_USER_PROMPT().includes('门洞处断开'), 'user prompt door gaps')
console.log('ai-walls-prompt.test ok')
