import assert from 'node:assert/strict'
import { findDoorGapPairs } from './door-gaps'

const pairs = findDoorGapPairs([
  { id: 'a', x: 0, y: 0, neighbor: { x: -200, y: 0 } },
  { id: 'b', x: 90, y: 0, neighbor: { x: 300, y: 0 } },
  { id: 'c', x: 0, y: 400, neighbor: { x: 0, y: 200 } },
  { id: 'd', x: 400, y: 400, neighbor: null }
])
assert.deepEqual(pairs, [['a', 'b']], `door pair ${JSON.stringify(pairs)}`)

const tooWide = findDoorGapPairs([
  { id: 'a', x: 0, y: 0, neighbor: { x: -100, y: 0 } },
  { id: 'b', x: 400, y: 0, neighbor: { x: 600, y: 0 } }
])
assert.equal(tooWide.length, 0, 'wide opening is not a door')

const bent = findDoorGapPairs([
  { id: 'a', x: 0, y: 0, neighbor: { x: -100, y: 0 } },
  { id: 'b', x: 0, y: 90, neighbor: { x: 0, y: 200 } }
])
assert.equal(bent.length, 0, 'L-shaped dangling ends are not a door')

const acrossGap = findDoorGapPairs([
  { id: 'c1', x: 0, y: 0, neighbor: { x: 200, y: 0 } },
  { id: 'c2', x: 200, y: 0, neighbor: { x: 0, y: 0 } },
  { id: 'c3', x: 290, y: 0, neighbor: { x: 500, y: 0 } },
  { id: 'c4', x: 500, y: 0, neighbor: { x: 290, y: 0 } }
])
assert.deepEqual(acrossGap, [['c2', 'c3']], `gap between two walls ${JSON.stringify(acrossGap)}`)

console.log('door-gaps.test ok')
