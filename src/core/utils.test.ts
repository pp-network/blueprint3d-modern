import assert from 'node:assert/strict'
import { Utils } from './utils'

const roomAroundOrigin = [
  { x: -200, y: -150 },
  { x: 200, y: -150 },
  { x: 200, y: 150 },
  { x: -200, y: 150 }
]

assert.equal(Utils.pointInPolygon(0, 0, roomAroundOrigin), true, 'origin is inside a centered room')
assert.equal(Utils.pointInPolygon(180, 0, roomAroundOrigin), true, 'point near wall is inside')
assert.equal(Utils.pointInPolygon(400, 0, roomAroundOrigin), false, 'point outside is outside')

const defaultTemplateRoom = [
  { x: 204, y: 289 },
  { x: 672, y: 289 },
  { x: 672, y: -178 },
  { x: 204, y: -178 }
]
assert.equal(Utils.pointInPolygon(400, 50, defaultTemplateRoom), true, 'default demo room still works')
assert.equal(Utils.pointInPolygon(0, 0, defaultTemplateRoom), false, 'origin is outside default demo room')

console.log('utils.test ok')
