import assert from 'node:assert/strict'
import { Floorplan } from './floorplan'
import { drawioToSavedFloorplan, isDrawioXml, savedFloorplanToDrawio } from './floorplan-drawio'

const floorplan = {
  corners: {
    a: { x: 0, y: 0 },
    b: { x: 400, y: 0 },
    c: { x: 400, y: 300 }
  },
  walls: [
    { corner1: 'a', corner2: 'b' },
    { corner1: 'b', corner2: 'c', opening: true }
  ]
}

const xml = savedFloorplanToDrawio(floorplan, '测试')
assert.equal(isDrawioXml(xml), true)
assert.match(xml, /<mxfile/)
assert.match(xml, /source="a"/)
const back = drawioToSavedFloorplan(xml)
assert.equal(Object.keys(back.corners).length, 3)
assert.equal(back.walls.length, 2)
assert.equal(back.walls[0].corner1, 'a')
assert.equal(back.walls[1].opening, true)
assert.equal(back.corners.b.x, 400)

const broken = new Floorplan()
broken.loadFloorplan({
  corners: {
    a: { x: 0, y: 0 },
    b: { x: 200, y: 0 }
  },
  walls: [
    { corner1: 'a', corner2: 'b' },
    { corner1: 'missing', corner2: 'b' },
    { corner1: 'a', corner2: 'gone' }
  ]
})
assert.equal(broken.getWalls().length, 1, 'walls with missing corners are skipped')
assert.equal(broken.getCorners().length, 2)

console.log('floorplan-drawio.test ok')
