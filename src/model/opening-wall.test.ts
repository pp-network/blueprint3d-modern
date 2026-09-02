import assert from 'node:assert/strict'
import { Floorplan } from './floorplan'
import {
  ensureOpeningWallAt,
  fillOpening,
  insertOpeningOnWall,
  isolateOpeningCorner,
  nearestWallAt,
  slideOpening
} from './opening-wall'

const reused = new Floorplan()
const a = reused.newCorner(0, 0)
const b = reused.newCorner(200, 0)
const wall = reused.newWall(a, b)
const hit = ensureOpeningWallAt(reused, 100, 8, 90)
assert.equal(hit, wall, 'snaps to an existing wall')

const gap = new Floorplan()
const c1 = gap.newCorner(0, 0)
const c2 = gap.newCorner(200, 0)
const c3 = gap.newCorner(290, 0)
const c4 = gap.newCorner(500, 0)
gap.newWall(c1, c2)
gap.newWall(c3, c4)
gap.update()
const opening = nearestWallAt(gap, 245, 0)
assert.ok(opening?.wall.opening, 'door gap is closed with an opening wall')
assert.equal(ensureOpeningWallAt(gap, 245, 2, 90), opening!.wall)

const empty = new Floorplan()
const created = ensureOpeningWallAt(empty, 10, 20, 90)
assert.ok(created, 'creates an opening when there is no wall')
assert.equal(created!.opening, true)
assert.ok(created!.distanceFrom(10, 20) < 2, 'new opening is centered on the click')
assert.ok(created!.getStart().distanceFrom(created!.getEnd().x, created!.getEnd().y) > 70)

const punch = new Floorplan()
const p1 = punch.newCorner(0, 0)
const p2 = punch.newCorner(400, 0)
punch.newWall(p1, p2)
const cut = insertOpeningOnWall(punch, 200, 0, 90)
assert.ok(cut?.opening, 'click on wall cuts a door')
assert.ok(punch.getWalls().some((wall) => wall.opening))
assert.ok(punch.getWalls().filter((wall) => !wall.opening).length >= 1, 'solid stubs remain')

const selectable = new Floorplan()
const s1 = selectable.newCorner(0, 0)
const s2 = selectable.newCorner(400, 0)
selectable.newWall(s1, s2)
const door = insertOpeningOnWall(selectable, 200, 0, 90)
assert.ok(door?.opening)
assert.equal(selectable.overlappedWall(200, 0)?.opening, true, 'opening is hit-testable')
assert.ok(selectable.overlappedWall(200, 3), 'opening has extra hover slop')

const midBefore = (door!.getStartX() + door!.getEndX()) / 2
slideOpening(door!, 40, 0)
const midAfter = (door!.getStartX() + door!.getEndX()) / 2
assert.ok(midAfter > midBefore + 20, 'door slides along the wall')
assert.ok(selectable.getWalls().some((wall) => !wall.opening && wall.getStartX() < 20), 'start stub remains')

fillOpening(selectable, door!)
assert.equal(door!.opening, false, 'delete fills the door as a solid wall')
selectable.update()
assert.ok(
  !selectable.getWalls().some((wall) => wall.opening),
  'closeDoorGaps does not recreate a filled door'
)

const marked = new Floorplan()
marked.detectedPlacements = {
  rooms: [],
  furniture: [],
  openings: [{ kind: 'door', name: '门', x: 200, y: 0 }]
}
marked.detectTransform = { originX: 0, originY: 0, cmPerImagePixel: 1 }
const m1 = marked.newCorner(0, 0)
const m2 = marked.newCorner(400, 0)
marked.newWall(m1, m2)
const markedDoor = insertOpeningOnWall(marked, 200, 0, 90)!
fillOpening(marked, markedDoor)
assert.equal(marked.detectedPlacements.openings.length, 0, 'placement marker is forgotten')

const nearCorner = new Floorplan()
const n1 = nearCorner.newCorner(0, 0)
const n2 = nearCorner.newCorner(400, 0)
const n3 = nearCorner.newCorner(0, 200)
nearCorner.newWall(n1, n2)
nearCorner.newWall(n1, n3)
const cornerDoor = insertOpeningOnWall(nearCorner, 8, 0, 90)
assert.ok(cornerDoor?.opening, 'door can sit next to a T-junction')
assert.ok(
  nearCorner.getWalls().some((wall) => !wall.opening && (wall.getStart() === n1 || wall.getEnd() === n1)),
  'corner stub remains'
)

const gapDoor = new Floorplan()
const g1 = gapDoor.newCorner(0, 0)
const g2 = gapDoor.newCorner(180, 0)
const g3 = gapDoor.newCorner(270, 0)
const g4 = gapDoor.newCorner(500, 0)
gapDoor.newWall(g1, g2)
gapDoor.newWall(g3, g4)
gapDoor.update()
const closedGap = insertOpeningOnWall(gapDoor, 225, 0, 90)
assert.ok(closedGap?.opening, 'click in a door gap closes it as an opening')

const isolated = new Floorplan()
const i1 = isolated.newCorner(0, 0)
const i2 = isolated.newCorner(400, 0)
isolated.newWall(i1, i2)
const punched = insertOpeningOnWall(isolated, 200, 0, 90)!
const jamb = punched.getStart()
const wallX = i1.x
const doorEnd = isolateOpeningCorner(isolated, punched, jamb)
assert.notEqual(doorEnd, jamb, 'door vertex is detached from the wall')
doorEnd.move(doorEnd.x - 30, doorEnd.y + 40, { merge: false })
assert.equal(i1.x, wallX, 'solid wall corner stays put')
assert.ok(Math.abs(doorEnd.y - 40) < 1, 'door vertex moves freely')

console.log('opening-wall.test ok')
