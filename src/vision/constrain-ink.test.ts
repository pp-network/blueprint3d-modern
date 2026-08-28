import assert from 'node:assert/strict'
import { constrainTraceToInk, dropCabinetLikeWalls, mergeMissedInkWalls } from './constrain-ink'
import { traceBBox } from './build-floorplan'
import type { TraceImageData } from './trace-walls'
import type { WallTrace } from './types'

function whiteWithBar(): TraceImageData {
  const width = 100
  const height = 60
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  for (let x = 10; x <= 90; x++) {
    for (let y = 18; y <= 22; y++) {
      const o = (y * width + x) * 4
      data[o] = data[o + 1] = data[o + 2] = 0
    }
  }
  return { data, width, height }
}

const image = whiteWithBar()
const kept = constrainTraceToInk(
  {
    segments: [
      { x1: 12, y1: 20, x2: 88, y2: 20 },
      { x1: 20, y1: 45, x2: 80, y2: 45 }
    ],
    bbox: traceBBox([
      { x1: 12, y1: 20, x2: 88, y2: 20 },
      { x1: 20, y1: 45, x2: 80, y2: 45 }
    ]),
    imageWidth: 100,
    imageHeight: 60,
    outerCount: 0
  },
  image
)
assert.equal(kept.segments.length, 1, `kept ${kept.segments.length}`)

const merged = mergeMissedInkWalls(
  {
    segments: [{ x1: 0, y1: 0, x2: 8, y2: 0 }],
    bbox: traceBBox([{ x1: 0, y1: 0, x2: 8, y2: 0 }]),
    imageWidth: 100,
    imageHeight: 60
  },
  {
    segments: [{ x1: 10, y1: 20, x2: 90, y2: 20 }],
    bbox: traceBBox([{ x1: 10, y1: 20, x2: 90, y2: 20 }]),
    imageWidth: 100,
    imageHeight: 60
  }
)
assert.equal(merged.segments.length, 2, 'missed ink wall added')

const closet: WallTrace = {
  segments: [
    { x1: 10, y1: 10, x2: 190, y2: 10 },
    { x1: 190, y1: 10, x2: 190, y2: 190 },
    { x1: 190, y1: 190, x2: 10, y2: 190 },
    { x1: 10, y1: 190, x2: 10, y2: 10 },
    { x1: 20, y1: 40, x2: 52, y2: 40 },
    { x1: 20, y1: 48, x2: 52, y2: 48 },
    { x1: 20, y1: 56, x2: 52, y2: 56 },
    { x1: 20, y1: 64, x2: 52, y2: 64 },
    { x1: 140, y1: 30, x2: 168, y2: 30 },
    { x1: 140, y1: 38, x2: 168, y2: 38 },
    { x1: 80, y1: 20, x2: 80, y2: 160 }
  ],
  bbox: traceBBox([]),
  imageWidth: 200,
  imageHeight: 200,
  outerCount: 4
}
const cleaned = dropCabinetLikeWalls(closet)
assert.equal(cleaned.outerCount, 4, 'outer envelope kept')
assert.equal(cleaned.segments.length, 7, `closet comb dropped, pair+partition kept ${cleaned.segments.length}`)
assert.ok(
  cleaned.segments.some((s) => s.x1 === 80 && s.x2 === 80),
  'room partition kept'
)

const isolatedTable = mergeMissedInkWalls(
  {
    segments: [{ x1: 20, y1: 20, x2: 200, y2: 20 }],
    bbox: traceBBox([{ x1: 20, y1: 20, x2: 200, y2: 20 }]),
    imageWidth: 400,
    imageHeight: 400,
    outerCount: 1
  },
  {
    segments: [{ x1: 80, y1: 220, x2: 140, y2: 220 }],
    bbox: traceBBox([{ x1: 80, y1: 220, x2: 140, y2: 220 }]),
    imageWidth: 400,
    imageHeight: 400
  }
)
assert.equal(isolatedTable.segments.length, 1, 'isolated furniture edge not merged')

console.log('constrain-ink.test ok')
