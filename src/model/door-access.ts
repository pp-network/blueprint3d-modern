import { Utils } from '../core/utils'
import type { Floorplan } from './floorplan'
import type { Room } from './room'
import type { Wall } from './wall'
import { OPENING_SNAP_CM } from './opening-wall'

export interface DoorAccessResult {
  roomsWithoutDoor: string[]
  unreachable: string[]
  ok: boolean
}

const OUTSIDE = '__outside__'

/** Closed rooms must have a door, and doors must connect every room. */
export function judgeDoorAccess(floorplan: Floorplan): DoorAccessResult {
  const rooms = floorplan.getRooms().filter((room) => room.getArea() >= 4000)
  const roomsWithoutDoor: string[] = []
  const adj = new Map<string, Set<string>>()
  const idOf = (room: Room) => room.getUuid()
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }

  for (const room of rooms) {
    adj.set(idOf(room), adj.get(idOf(room)) ?? new Set())
    const walls = wallsOfRoom(room)
    const openings = walls.filter((wall) => wall.opening)
    const hasPlacedDoor = doorTouchesRoom(floorplan, room, walls)
    if (openings.length === 0 && !hasPlacedDoor) {
      roomsWithoutDoor.push(roomName(room))
    }
    for (const wall of openings) {
      const other = otherRoomAcross(floorplan, room, wall)
      if (other) addEdge(idOf(room), idOf(other))
      else addEdge(idOf(room), OUTSIDE)
    }
    if (hasPlacedDoor && openings.length === 0) {
      const outer = walls.some((wall) => !otherRoomAcross(floorplan, room, wall))
      if (outer) addEdge(idOf(room), OUTSIDE)
    }
  }

  connectByPlacedDoors(floorplan, rooms, addEdge)

  const start = adj.has(OUTSIDE)
    ? OUTSIDE
    : rooms[0]
      ? idOf(rooms[0])
      : ''
  const seen = new Set<string>()
  if (start) {
    const stack = [start]
    seen.add(start)
    while (stack.length) {
      const cur = stack.pop()!
      for (const next of adj.get(cur) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        stack.push(next)
      }
    }
  }

  const unreachable = rooms
    .filter((room) => !seen.has(idOf(room)))
    .map((room) => roomName(room))

  return {
    roomsWithoutDoor: unique(roomsWithoutDoor),
    unreachable: unique(unreachable),
    ok: roomsWithoutDoor.length === 0 && unreachable.length === 0
  }
}

export function formatDoorAccessZh(result: DoorAccessResult): string {
  const lines: string[] = []
  if (result.roomsWithoutDoor.length) {
    lines.push(`这些闭合房间没有门：${result.roomsWithoutDoor.join('、')}`)
  }
  if (result.unreachable.length) {
    lines.push(`从门走不到：${result.unreachable.join('、')}`)
  }
  if (result.ok) {
    lines.push('每个闭合房间都有门，并能互相走到')
  }
  return lines.join('\n')
}

export function wallsOfRoom(room: Room): Wall[] {
  const walls: Wall[] = []
  const corners = room.corners
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % corners.length]
    const wall = a.wallTo(b) ?? a.wallFrom(b)
    if (wall) walls.push(wall)
  }
  return walls
}

export function otherRoomAcross(floorplan: Floorplan, room: Room, wall: Wall): Room | null {
  for (const other of floorplan.getRooms()) {
    if (other === room) continue
    if (wallsOfRoom(other).includes(wall)) return other
  }
  return null
}

function doorTouchesRoom(floorplan: Floorplan, room: Room, walls: Wall[]): boolean {
  const doors = (floorplan.detectedPlacements?.openings ?? []).filter(
    (item) => item.kind === 'door' || /门/.test(item.name ?? '')
  )
  const map = floorplan.detectTransform
  if (!map || doors.length === 0) return false
  for (const door of doors) {
    const x = map.originX + door.x * map.cmPerImagePixel
    const y = map.originY + door.y * map.cmPerImagePixel
    for (const wall of walls) {
      if (wall.distanceFrom(x, y) <= OPENING_SNAP_CM) return true
    }
  }
  return false
}

function connectByPlacedDoors(
  floorplan: Floorplan,
  rooms: Room[],
  addEdge: (a: string, b: string) => void
): void {
  const doors = (floorplan.detectedPlacements?.openings ?? []).filter(
    (item) => item.kind === 'door' || /门/.test(item.name ?? '')
  )
  const map = floorplan.detectTransform
  if (!map) return
  for (const door of doors) {
    const x = map.originX + door.x * map.cmPerImagePixel
    const y = map.originY + door.y * map.cmPerImagePixel
    const touched = rooms.filter((room) =>
      wallsOfRoom(room).some((wall) => wall.distanceFrom(x, y) <= OPENING_SNAP_CM)
    )
    if (touched.length >= 2) {
      addEdge(touched[0].getUuid(), touched[1].getUuid())
    } else if (touched.length === 1) {
      addEdge(touched[0].getUuid(), OUTSIDE)
    }
  }
}

function roomName(room: Room): string {
  return room.name?.trim() || '未命名房间'
}

function unique(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))]
}
