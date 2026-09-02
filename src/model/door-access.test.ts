import assert from 'node:assert/strict'
import { Floorplan } from './floorplan'
import { judgeDoorAccess } from './door-access'

function boxWithDivider(opening: boolean): Floorplan {
  const fp = new Floorplan()
  const a = fp.newCorner(0, 0)
  const b = fp.newCorner(200, 0)
  const c = fp.newCorner(400, 0)
  const d = fp.newCorner(0, 200)
  const e = fp.newCorner(200, 200)
  const f = fp.newCorner(400, 200)
  fp.newWall(a, b, { skipUpdate: true })
  fp.newWall(b, c, { skipUpdate: true })
  fp.newWall(c, f, { skipUpdate: true })
  fp.newWall(f, e, { skipUpdate: true })
  fp.newWall(e, d, { skipUpdate: true })
  fp.newWall(d, a, { skipUpdate: true })
  fp.newWall(b, e, { skipUpdate: true, opening })
  fp.update()
  return fp
}

const connected = boxWithDivider(true)
assert.equal(connected.getRooms().length, 2, 'two closed rooms')
const ok = judgeDoorAccess(connected)
assert.equal(ok.roomsWithoutDoor.length, 0, 'opening counts as a door')
assert.equal(ok.unreachable.length, 0, 'rooms walk through the opening')
assert.equal(ok.ok, true)

const sealed = boxWithDivider(false)
const bad = judgeDoorAccess(sealed)
assert.ok(bad.roomsWithoutDoor.length >= 1, 'solid divider has no door')
assert.equal(bad.ok, false)

sealed.detectTransform = { originX: 0, originY: 0, cmPerImagePixel: 1 }
sealed.detectedPlacements = {
  rooms: [],
  furniture: [],
  openings: [{ kind: 'door', name: '门', x: 80, y: 80 }]
}
const stillSealed = judgeDoorAccess(sealed)
assert.ok(
  stillSealed.roomsWithoutDoor.length >= 1,
  'a door label inside the room is not an opening'
)

console.log('door-access.test ok')
