import { savedFloorplanFromWorldSegments, worldSegmentsFromTrace } from './build-floorplan'
import { traceWallsFromImageData } from './trace-walls'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function makeRectPlan(width: number, height: number): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  const ink = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const o = (y * width + x) * 4
    data[o] = 0
    data[o + 1] = 0
    data[o + 2] = 0
  }
  const box = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < t; x++) {
        ink(x0 + x, y)
        ink(x1 - x, y)
      }
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = 0; y < t; y++) {
        ink(x, y0 + y)
        ink(x, y1 - y)
      }
    }
  }
  box(40, 30, 360, 270, 8)
  // thin dimension line should be opened away
  for (let x = 20; x < 380; x++) {
    ink(x, 10)
  }
  return { data, width, height }
}

const image = makeRectPlan(400, 300)
const trace = traceWallsFromImageData(image)
assert(trace.segments.length >= 4, `expected >= 4 walls, got ${trace.segments.length}`)
assert(trace.segments.length <= 8, `too many walls: ${trace.segments.length}`)

const horiz = trace.segments.filter((s) => Math.abs(s.y1 - s.y2) < 2)
const vert = trace.segments.filter((s) => Math.abs(s.x1 - s.x2) < 2)
assert(horiz.length >= 2, 'need two horizontal walls')
assert(vert.length >= 2, 'need two vertical walls')

const worlds = worldSegmentsFromTrace(trace, 0, 0, 1)
const saved = savedFloorplanFromWorldSegments(worlds)
assert(Object.keys(saved.corners).length >= 4, 'need 4 corners')
assert(saved.walls.length >= 4, 'need 4 saved walls')

console.log('trace-walls.test ok', { walls: trace.segments.length, saved: saved.walls.length })
