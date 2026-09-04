import assert from 'node:assert/strict'
import { cadInkMask, isYellowAnnotation } from './cad-ink'
import type { TraceImageData } from './trace-walls'

assert.equal(isYellowAnnotation(240, 220, 40), true)
assert.equal(isYellowAnnotation(20, 20, 20), false)
assert.equal(isYellowAnnotation(0, 220, 220), false)

function darkCad(): TraceImageData {
  const width = 80
  const height = 40
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    data[o] = data[o + 1] = data[o + 2] = 8
    data[o + 3] = 255
  }
  const px = (x: number, y: number, r: number, g: number, b: number) => {
    const o = (y * width + x) * 4
    data[o] = r
    data[o + 1] = g
    data[o + 2] = b
  }
  for (let x = 8; x <= 72; x++) px(x, 6, 250, 230, 30)
  for (let y = 12; y <= 32; y++) {
    for (let x = 30; x <= 44; x++) px(x, y, 130, 130, 130)
  }
  return { data, width, height }
}

const mask = cadInkMask(darkCad())
assert.equal(mask[6 * 80 + 40], 0, 'yellow dimension is not ink')
assert.equal(mask[22 * 80 + 37], 1, 'gray filled bearing is ink')

console.log('cad-ink.test ok')
