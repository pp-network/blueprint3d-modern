import assert from 'node:assert/strict'
import { extractFloorplanPlacements } from './ai-walls-schema'
import { Floorplan } from '../model/floorplan'
import { isOpeningItem, pixelToWorldPoint, punchDetectedOpenings, rememberDetectedScene, unclosedRoomNames } from './place-findings'

const text = JSON.stringify({
  findings: {
    overallWidthMm: 18670,
    rooms: [{ name: '客厅', x: 120, y: 80 }],
    furniture: [
      { kind: 'bed', name: '双人床', x: 200, y: 90 },
      { kind: 'door', name: '门', x: 40, y: 80 }
    ],
    openings: [{ kind: 'window', name: '窗', x: 10, y: 40 }]
  }
})

const placements = extractFloorplanPlacements(text)
assert.ok(placements, 'placements exist')
assert.equal(placements!.rooms[0].name, '客厅')
assert.equal(placements!.furniture.length, 1, 'door moved out of furniture')
assert.equal(placements!.furniture[0].kind, 'bed')
assert.equal(placements!.openings.length, 2, 'door + window')
assert.ok(placements!.openings.some((o) => o.kind === 'door'))

const world = pixelToWorldPoint(100, 50, -200, -100, 2)
assert.equal(world.x, 0)
assert.equal(world.y, 0)

const model = {
  floorplan: {
    roomLabels: [],
    detectTransform: null,
    detectedPlacements: null,
    relabelRooms() {
      /* labels only */
    }
  }
}
rememberDetectedScene(
  model as never,
  { originX: -200, originY: -100, cmPerImagePixel: 2 },
  placements
)
assert.equal(model.floorplan.roomLabels[0].name, '客厅')
assert.equal(model.floorplan.roomLabels[0].x, 40)
assert.equal(model.floorplan.detectedPlacements?.furniture.length, 1)
assert.equal(model.floorplan.detectedPlacements?.openings.length, 2)

const punchPlan = new Floorplan()
const a = punchPlan.newCorner(0, 0)
const b = punchPlan.newCorner(400, 0)
punchPlan.newWall(a, b)
const punchModel = {
  floorplan: punchPlan
}
rememberDetectedScene(
  punchModel as never,
  { originX: 0, originY: 0, cmPerImagePixel: 1 },
  { rooms: [], furniture: [], openings: [{ kind: 'door', name: '门', x: 200, y: 0 }] }
)
assert.equal(punchDetectedOpenings(punchModel as never), 1)
assert.ok(punchPlan.getWalls().some((wall) => wall.opening), 'AI door is punched as a 2D opening')

const offsetPlan = new Floorplan()
const oa = offsetPlan.newCorner(0, 0)
const ob = offsetPlan.newCorner(400, 0)
offsetPlan.newWall(oa, ob)
const offsetModel = { floorplan: offsetPlan }
rememberDetectedScene(
  offsetModel as never,
  { originX: 0, originY: 0, cmPerImagePixel: 1 },
  { rooms: [], furniture: [], openings: [{ kind: 'door', name: '门', x: 200, y: 40 }] }
)
assert.ok(punchDetectedOpenings(offsetModel as never) >= 1, 'offset door still hosts onto the wall')
assert.ok(offsetPlan.getWalls().some((wall) => wall.opening), 'hosted door cuts the wall')

const sealedPlan = new Floorplan()
const sa = sealedPlan.newCorner(0, 0)
const sb = sealedPlan.newCorner(200, 0)
const sc = sealedPlan.newCorner(400, 0)
const sd = sealedPlan.newCorner(0, 200)
const se = sealedPlan.newCorner(200, 200)
const sf = sealedPlan.newCorner(400, 200)
sealedPlan.newWall(sa, sb, { skipUpdate: true })
sealedPlan.newWall(sb, sc, { skipUpdate: true })
sealedPlan.newWall(sc, sf, { skipUpdate: true })
sealedPlan.newWall(sf, se, { skipUpdate: true })
sealedPlan.newWall(se, sd, { skipUpdate: true })
sealedPlan.newWall(sd, sa, { skipUpdate: true })
sealedPlan.newWall(sb, se, { skipUpdate: true })
sealedPlan.update()
sealedPlan.roomLabels = [
  { name: '左房', x: 80, y: 100 },
  { name: '右房', x: 300, y: 100 }
]
sealedPlan.relabelRooms()
const sealedModel = { floorplan: sealedPlan }
rememberDetectedScene(sealedModel as never, { originX: 0, originY: 0, cmPerImagePixel: 1 }, {
  rooms: [
    { name: '左房', x: 80, y: 100 },
    { name: '右房', x: 300, y: 100 }
  ],
  furniture: [],
  openings: []
})
assert.ok(punchDetectedOpenings(sealedModel as never) >= 1, 'sealed rooms get a door cut')
assert.ok(sealedPlan.getWalls().some((wall) => wall.opening), 'confirmation actually opens a wall')

const outerOnly = new Floorplan()
const oa1 = outerOnly.newCorner(0, 0)
const oa2 = outerOnly.newCorner(300, 0)
const oa3 = outerOnly.newCorner(300, 200)
const oa4 = outerOnly.newCorner(0, 200)
outerOnly.newWall(oa1, oa2, { skipUpdate: true })
outerOnly.newWall(oa2, oa3, { skipUpdate: true })
outerOnly.newWall(oa3, oa4, { skipUpdate: true })
outerOnly.newWall(oa4, oa1, { skipUpdate: true })
outerOnly.update()
outerOnly.roomLabels = [{ name: '客厅', x: 150, y: 100 }]
outerOnly.relabelRooms()
const outerModel = { floorplan: outerOnly }
rememberDetectedScene(outerModel as never, { originX: 0, originY: 0, cmPerImagePixel: 1 }, {
  rooms: [{ name: '客厅', x: 150, y: 100 }],
  furniture: [],
  openings: [{ kind: 'door', name: '门', x: 800, y: 800 }]
})
assert.equal(punchDetectedOpenings(outerModel as never), 0, 'far door and outer walls stay solid')
assert.ok(!outerOnly.getWalls().some((wall) => wall.opening), 'finish does not cut the envelope')

assert.equal(isOpeningItem({ metadata: { itemType: 7, itemKey: 'doorOne' } }), true)
assert.equal(isOpeningItem({ metadata: { itemType: 1, itemKey: 'sofaOne' } }), false)

const unclosed = unclosedRoomNames({
  roomLabels: [
    { name: '主卧', x: 10, y: 10 },
    { name: '客厅', x: 50, y: 50 }
  ],
  getRooms: () => [
    {
      interiorCorners: [
        { x: 40, y: 40 },
        { x: 60, y: 40 },
        { x: 60, y: 60 },
        { x: 40, y: 60 }
      ]
    }
  ]
})
assert.deepEqual(unclosed, ['主卧'])

const labeled = new Floorplan()
const r1 = labeled.newCorner(0, 0)
const r2 = labeled.newCorner(400, 0)
const r3 = labeled.newCorner(400, 300)
const r4 = labeled.newCorner(0, 300)
const mid = labeled.newCorner(200, 0)
const midB = labeled.newCorner(200, 300)
labeled.newWall(r1, mid)
labeled.newWall(mid, r2)
labeled.newWall(r2, r3)
labeled.newWall(r3, midB)
labeled.newWall(midB, r4)
labeled.newWall(r4, r1)
labeled.newWall(mid, midB)
labeled.roomLabels = [
  { name: '厨房', x: 80, y: 150 },
  { name: '客厅', x: 300, y: 150 },
  { name: '1客厅/1生活阳台/1次卫/1主卧', x: 200, y: 140 }
]
labeled.update()
const names = labeled.getRooms().map((room) => room.name).sort()
assert.ok(names.includes('厨房') && names.includes('客厅'), `split rooms keep own names: ${names.join(',')}`)
assert.ok(!names.some((name) => name.includes('/')), 'directory strip is not concatenated onto a room')

console.log('place-findings.test ok')
