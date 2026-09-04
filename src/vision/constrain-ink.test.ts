import assert from 'node:assert/strict'
import {
  constrainTraceToInk,
  dropCabinetLikeWalls,
  dropThinDimensionWalls,
  complementThickInkWalls,
  mergeMissedInkWalls,
  shouldKeepInkConstrained,
  snapTraceToInk
} from './constrain-ink'
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

const isolatedLong = mergeMissedInkWalls(
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
assert.equal(isolatedLong.segments.length, 1, 'isolated long CAD line not merged')

const outerKept = constrainTraceToInk(
  {
    segments: [
      { x1: 5, y1: 5, x2: 90, y2: 5 },
      { x1: 90, y1: 5, x2: 90, y2: 50 },
      { x1: 90, y1: 50, x2: 5, y2: 50 },
      { x1: 5, y1: 50, x2: 5, y2: 5 },
      { x1: 20, y1: 45, x2: 80, y2: 45 }
    ],
    bbox: traceBBox([]),
    imageWidth: 100,
    imageHeight: 60,
    outerCount: 4
  },
  image
)
assert.equal(outerKept.outerCount, 4, 'outer loop never dropped')
assert.equal(outerKept.segments.length, 4, 'inner without ink dropped, outer kept')

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

const manyInner: WallTrace = {
  segments: [
    { x1: 0, y1: 0, x2: 100, y2: 0 },
    { x1: 100, y1: 0, x2: 100, y2: 80 },
    { x1: 100, y1: 80, x2: 0, y2: 80 },
    { x1: 0, y1: 80, x2: 0, y2: 0 },
    { x1: 20, y1: 20, x2: 80, y2: 20 },
    { x1: 20, y1: 40, x2: 80, y2: 40 },
    { x1: 20, y1: 60, x2: 80, y2: 60 },
    { x1: 40, y1: 10, x2: 40, y2: 70 },
    { x1: 60, y1: 10, x2: 60, y2: 70 }
  ],
  bbox: traceBBox([]),
  imageWidth: 100,
  imageHeight: 80,
  outerCount: 4
}
const fewInner = {
  ...manyInner,
  segments: manyInner.segments.slice(0, 6)
}
assert.equal(shouldKeepInkConstrained(manyInner, fewInner), false, 'do not accept wiping most partitions')
assert.equal(
  shouldKeepInkConstrained(manyInner, { ...manyInner, segments: manyInner.segments.slice(0, 8) }),
  true,
  'keep ink when most inners survive'
)

function sheetWithThinAndThick(): TraceImageData {
  const width = 120
  const height = 80
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  const ink = (x: number, y: number) => {
    const o = (y * width + x) * 4
    data[o] = data[o + 1] = data[o + 2] = 0
  }
  for (let y = 10; y <= 70; y++) ink(30, y)
  for (let y = 10; y <= 70; y++) {
    for (let x = 68; x <= 76; x++) ink(x, y)
  }
  return { data, width, height }
}

const mixed = dropThinDimensionWalls(
  {
    segments: [
      { x1: 30, y1: 12, x2: 30, y2: 68 },
      { x1: 72, y1: 12, x2: 72, y2: 68 }
    ],
    bbox: traceBBox([]),
    imageWidth: 120,
    imageHeight: 80,
    outerCount: 0
  },
  sheetWithThinAndThick()
)
assert.equal(mixed.segments.length, 1, 'thin dimension dropped, thick bearing kept')
assert.equal(mixed.segments[0].x1, 72)

const offset = snapTraceToInk(
  {
    segments: [{ x1: 12, y1: 26, x2: 88, y2: 26 }],
    bbox: traceBBox([{ x1: 12, y1: 26, x2: 88, y2: 26 }]),
    imageWidth: 100,
    imageHeight: 60,
    outerCount: 0
  },
  whiteWithBar()
)
assert.ok(Math.abs(offset.segments[0].y1 - 20) <= 2, `snapped y=${offset.segments[0].y1}`)
assert.ok(Math.abs(offset.segments[0].y2 - 20) <= 2, 'both ends snap onto the ink bar')

function sheetWithLBearing(): TraceImageData {
  const width = 160
  const height = 140
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  const ink = (x: number, y: number) => {
    const o = (y * width + x) * 4
    data[o] = data[o + 1] = data[o + 2] = 0
  }
  for (let y = 20; y <= 120; y++) {
    for (let x = 78; x <= 86; x++) ink(x, y)
  }
  for (let x = 78; x <= 112; x++) {
    for (let y = 20; y <= 28; y++) ink(x, y)
  }
  for (let x = 10; x <= 150; x++) ink(x, 8)
  return { data, width, height }
}

const lSheet = sheetWithLBearing()
const lAi: WallTrace = {
  segments: [{ x1: 82, y1: 20, x2: 82, y2: 120 }],
  bbox: traceBBox([{ x1: 82, y1: 20, x2: 82, y2: 120 }]),
  imageWidth: 160,
  imageHeight: 140,
  outerCount: 0
}
const lLocal: WallTrace = {
  segments: [
    { x1: 82, y1: 20, x2: 82, y2: 120 },
    { x1: 82, y1: 24, x2: 110, y2: 24 },
    { x1: 10, y1: 8, x2: 150, y2: 8 }
  ],
  bbox: traceBBox([]),
  imageWidth: 160,
  imageHeight: 140
}
const complemented = complementThickInkWalls(lAi, lLocal, lSheet)
assert.ok(
  complemented.segments.some((s) => Math.abs(s.y1 - 24) < 3 && Math.abs(s.x2 - s.x1) > 20),
  'short thick L-return is added'
)
assert.ok(
  !complemented.segments.some((s) => Math.abs(s.y1 - 8) < 2),
  'thin dimension tick is not added'
)

function sheetWithOuterDim(): TraceImageData {
  const width = 120
  const height = 80
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  const ink = (x: number, y: number) => {
    const o = (y * width + x) * 4
    data[o] = data[o + 1] = data[o + 2] = 0
  }
  for (let x = 20; x <= 100; x++) {
    for (let y = 24; y <= 30; y++) ink(x, y)
  }
  for (let x = 4; x <= 116; x++) ink(x, 3)
  return { data, width, height }
}

const outerDim = dropThinDimensionWalls(
  {
    segments: [
      { x1: 4, y1: 3, x2: 116, y2: 3 },
      { x1: 20, y1: 27, x2: 100, y2: 27 }
    ],
    bbox: traceBBox([]),
    imageWidth: 120,
    imageHeight: 80,
    outerCount: 1
  },
  sheetWithOuterDim()
)
assert.equal(outerDim.segments.length, 1, 'outer dimension chain is dropped')
assert.ok(Math.abs(outerDim.segments[0].y1 - 27) < 2, 'thick building wall kept')

function darkFilled(): TraceImageData {
  const width = 140
  const height = 80
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    data[o] = data[o + 1] = data[o + 2] = 10
    data[o + 3] = 255
  }
  const ink = (x: number, y: number, v = 140) => {
    const o = (y * width + x) * 4
    data[o] = data[o + 1] = data[o + 2] = v
  }
  for (let y = 10; y <= 70; y++) {
    for (let x = 40; x <= 48; x++) ink(x, y, 220)
  }
  for (let y = 28; y <= 52; y++) {
    for (let x = 50; x <= 66; x++) ink(x, y, 130)
  }
  return { data, width, height }
}

const filled = complementThickInkWalls(
  {
    segments: [{ x1: 44, y1: 10, x2: 44, y2: 70 }],
    bbox: traceBBox([]),
    imageWidth: 140,
    imageHeight: 80,
    outerCount: 0
  },
  {
    segments: [
      { x1: 44, y1: 10, x2: 44, y2: 70 },
      { x1: 58, y1: 28, x2: 58, y2: 52 }
    ],
    bbox: traceBBox([]),
    imageWidth: 140,
    imageHeight: 80
  },
  darkFilled()
)
assert.ok(
  filled.segments.some((s) => Math.abs(s.x1 - 58) < 4),
  'gray filled bearing next to a wall is added'
)

console.log('constrain-ink.test ok')
