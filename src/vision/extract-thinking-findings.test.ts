import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  collectFloorplanFindings,
  collectFloorplanPlacements,
  extractThinkingPlacements
} from './extract-thinking-findings'

const thinking = `
The "次卧" is located at (280, 650), the "餐厅" with its large table at (360, 460), and the "厨房" above that at (280, 350).
The "客厅" with sofa and TV is at (380, 650), indicating the main entrance is on the west side at (230, 540).
The "主卫" is around (640, 530), and the "次卫" is near (470, 420).
The kitchen is at (300, 390), the dining area at (350, 500), and the living room at (370, 680).
The lower left secondary bedroom is at (290, 690), with the master bedroom at (550, 710).
A significant wardrobe is noted near (520, 520).
doorway at (430, 420) and the master bathroom's west wall, creating an opening for its door around (590, 560).
The secondary bedroom's southern door at approximately (510, 470).
northwest corner at (230, 310) and the southern wall alignment at y=760.
overall building width as 18670mm.
`

const placed = extractThinkingPlacements(thinking)
assert.ok(placed, 'thinking placements exist')
assert.equal(placed!.overallWidthMm, 18670)
assert.ok(placed!.rooms.some((r) => r.name === '厨房' && r.x === 300 && r.y === 390), 'later kitchen coord wins nearby')
assert.ok(placed!.rooms.some((r) => r.name === '客厅'), '客厅 stays a room')
assert.ok(placed!.rooms.some((r) => r.name === '餐厅'))
assert.ok(placed!.rooms.some((r) => r.name === '主卧' && r.x === 550))
assert.ok(placed!.rooms.filter((r) => r.name === '次卧').length >= 1)
assert.ok(placed!.openings.some((o) => o.kind === 'door' && o.name === '入户门' && o.x === 230 && o.y === 540))
assert.ok(placed!.openings.some((o) => o.name === '主卫门'))
assert.ok(placed!.openings.some((o) => o.name === '次卧门'))
assert.ok(placed!.furniture.some((f) => f.kind === 'wardrobe'))
assert.ok(!placed!.rooms.some((r) => r.x === 230 && r.y === 310), 'outer corner is not a room')
assert.ok(!placed!.openings.some((o) => o.x === 230 && o.y === 310), 'outer corner is not a door')
assert.ok(!placed!.furniture.some((f) => f.x === 380 && f.y === 650), 'sofa mention does not steal 客厅')

const merged = collectFloorplanPlacements({
  output: '{"findings":{"rooms":[{"name":"书房","x":10,"y":20}],"openings":[{"kind":"window","name":"窗","x":1,"y":2}]}}',
  thinking
})
assert.ok(merged!.rooms.some((r) => r.name === '书房'), 'JSON room kept')
assert.ok(merged!.rooms.some((r) => r.name === '客厅'), 'thinking room added')
assert.ok(merged!.openings.some((o) => o.kind === 'window'), 'JSON window kept')
assert.ok(merged!.openings.some((o) => o.kind === 'door'), 'thinking door added')

const dump = JSON.parse(
  readFileSync(path.join(process.cwd(), 'tmp/ai-detect/latest.json'), 'utf8')
) as { thinking?: string; rawOutput?: string }
const fromLatest = collectFloorplanPlacements({
  output: dump.rawOutput,
  thinking: dump.thinking
})
assert.ok(fromLatest, 'latest thinking yields placements')
assert.ok((fromLatest!.rooms.length ?? 0) >= 4, `latest rooms ${fromLatest!.rooms.length}`)
assert.ok((fromLatest!.openings.length ?? 0) >= 2, `latest doors ${fromLatest!.openings.length}`)
assert.equal(fromLatest!.overallWidthMm, 18670)

const findings = collectFloorplanFindings({ thinking, output: dump.rawOutput })
assert.ok(findings?.rooms.includes('厨房'))
assert.equal(findings?.overallWidthMm, 18670)

console.log('extract-thinking-findings.test ok')
