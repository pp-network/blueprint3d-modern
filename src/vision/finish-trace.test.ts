import assert from 'node:assert/strict'
import { finishWallTrace, keepPreviewTrace, previewLooksIncomplete } from './finish-trace'
import { traceBBox } from './build-floorplan'
import type { WallTrace } from './types'

function box(outer: number, inners: Array<{ x1: number; y1: number; x2: number; y2: number }>): WallTrace {
  const segments = [
    { x1: 100, y1: 100, x2: 700, y2: 100 },
    { x1: 700, y1: 100, x2: 700, y2: 500 },
    { x1: 700, y1: 500, x2: 100, y2: 500 },
    { x1: 100, y1: 500, x2: 100, y2: 100 },
    ...inners
  ]
  return {
    segments,
    bbox: traceBBox(segments),
    imageWidth: 800,
    imageHeight: 600,
    outerCount: outer
  }
}

const preview = box(4, [{ x1: 400, y1: 100, x2: 400, y2: 500 }])

const exploded = box(4, [
  { x1: 400, y1: 100, x2: 400, y2: 500 },
  ...Array.from({ length: 20 }, (_, i) => ({
    x1: 120 + i * 20,
    y1: 120,
    x2: 120 + i * 20,
    y2: 480
  }))
])

const kept = finishWallTrace(preview, exploded)
assert.equal(kept.segments[0].x1, 100, 'preview outer is not rewritten')
assert.equal(kept.segments[4].x1, 400, 'preview inner stays')
assert.ok(kept.segments.length <= preview.segments.length + 8, 'finish extras are capped')
assert.ok(kept.segments.length > preview.segments.length, 'new inner walls can still be added')

const same = keepPreviewTrace(preview, preview)
assert.equal(same.segments.length, preview.segments.length, 'identical finish adds nothing')

const stub: WallTrace = {
  segments: preview.segments.slice(0, 4),
  bbox: traceBBox(preview.segments.slice(0, 4)),
  imageWidth: 800,
  imageHeight: 600,
  outerCount: 4
}
assert.equal(previewLooksIncomplete(preview, exploded), false)
assert.equal(previewLooksIncomplete(stub, exploded), true)
assert.equal(finishWallTrace(stub, exploded).segments.length, exploded.segments.length, 'stub preview yields to finished')

assert.equal(finishWallTrace(preview, null).segments.length, preview.segments.length)
assert.equal(finishWallTrace(null, exploded).segments.length, exploded.segments.length)

console.log('finish-trace.test ok')
