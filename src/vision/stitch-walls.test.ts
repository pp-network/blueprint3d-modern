import assert from 'node:assert/strict'
import { stitchWallTrace } from './stitch-walls'

const broken = stitchWallTrace({
  imageWidth: 800,
  imageHeight: 600,
  outerCount: 2,
  bbox: { minX: 0, minY: 0, maxX: 200, maxY: 80 },
  segments: [
    { x1: 0, y1: 0, x2: 100, y2: 3 },
    { x1: 103, y1: 1, x2: 103, y2: 80 }
  ]
})

assert.equal(broken.segments.length, 2, 'keeps both walls')
const [a, b] = broken.segments
const aEnds = [
  [a.x1, a.y1],
  [a.x2, a.y2]
]
const shares = aEnds.some(([x, y]) => (x === b.x1 && y === b.y1) || (x === b.x2 && y === b.y2))
assert.equal(shares, true, 'near-miss corner becomes a shared point')

const stacked = stitchWallTrace({
  imageWidth: 1280,
  imageHeight: 978,
  outerCount: 0,
  bbox: { minX: 0, minY: 0, maxX: 200, maxY: 80 },
  segments: [
    { x1: 790, y1: 560, x2: 1004, y2: 560 },
    { x1: 827, y1: 560, x2: 860, y2: 560 },
    { x1: 920, y1: 560, x2: 1004, y2: 560 },
    { x1: 411, y1: 440, x2: 430, y2: 440 }
  ]
})
assert.equal(
  stacked.segments.filter((s) => Math.abs(s.y1 - 560) < 1).length,
  1,
  'overlapping collinear copies collapse to one wall'
)
assert.equal(
  stacked.segments.some((s) => Math.abs(s.y1 - 440) < 1),
  false,
  'orphan dimension tick is dropped'
)

const lJog = stitchWallTrace({
  imageWidth: 800,
  imageHeight: 600,
  outerCount: 0,
  bbox: { minX: 0, minY: 0, maxX: 420, maxY: 500 },
  segments: [
    { x1: 400, y1: 200, x2: 400, y2: 500 },
    { x1: 400, y1: 200, x2: 418, y2: 200 }
  ]
})
assert.equal(lJog.segments.length, 2, 'short L-return on a long bearing wall is kept')

console.log('stitch-walls.test ok')
