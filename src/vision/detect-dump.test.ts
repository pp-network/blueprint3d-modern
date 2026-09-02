import assert from 'node:assert/strict'
import { buildDetectDump, detectDumpFilename, detectDumpRoot } from './detect-dump'

assert.equal(detectDumpRoot('/repo/app'), '/repo/tmp/ai-detect')
assert.equal(detectDumpRoot('/repo'), '/repo/tmp/ai-detect')
assert.match(detectDumpFilename(new Date('2026-08-28T03:04:05')), /2026-08-28T.*-walls\.json/)

const raw = JSON.stringify({
  imageWidth: 1200,
  imageHeight: 850,
  outerLoop: [
    { x: 10, y: 10 },
    { x: 100, y: 10 },
    { x: 100, y: 80 },
    { x: 10, y: 80 }
  ],
  innerWalls: [],
  findings: {
    overallWidthMm: 18660,
    rooms: [{ name: '客厅', x: 40, y: 40 }],
    furniture: [{ kind: 'sofa', name: '转角沙发', x: 50, y: 50 }]
  }
})
const dump = buildDetectDump({
  savedAt: '2026-08-28T03:04:05.000Z',
  model: 'gemini-3.1-pro',
  overallWidthMm: 18660,
  imageWidth: 1200,
  imageHeight: 850,
  rawOutput: raw,
  thinking: 'The "客厅" is at (40, 40). The main entrance is at (12, 40). overall width 18660mm.',
  payload: JSON.parse(raw)
})

assert.equal(dump.model, 'gemini-3.1-pro')
assert.equal((dump.findings as { rooms: string[] }).rooms.includes('客厅'), true)
assert.equal((dump.placements as { furniture: Array<{ name: string }> }).furniture[0].name, '转角沙发')
assert.ok(Array.isArray(dump.critique))
assert.ok(dump.judge)
assert.equal((dump.judge as { stats: { outerPoints: number } }).stats.outerPoints, 4)
assert.ok((dump.placements as { openings: Array<{ name: string }> }).openings.some((o) => o.name === '入户门'))

console.log('detect-dump.test ok')
