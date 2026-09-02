import { Utils } from '../core/utils'
import { DOOR_GAP_MAX_CM, DOOR_GAP_MIN_CM } from './door-gaps'
import type { Floorplan } from './floorplan'
import type { Wall } from './wall'
import type { Corner } from './corner'

/** Typical interior door leaf, planner centimeters. */
export const DEFAULT_DOOR_WIDTH_CM = 90

/** Snap a door/window onto an existing wall or opening. */
export const OPENING_SNAP_CM = 70

/** Leave a short stub so a door can sit next to a corner / T-junction. */
const MIN_STUB_CM = 4

export function nearestWallAt(
  floorplan: Floorplan,
  x: number,
  y: number
): { wall: Wall; dist: number } | null {
  let best: { wall: Wall; dist: number; len: number } | null = null
  for (const wall of floorplan.getWalls()) {
    const dist = wall.distanceFrom(x, y)
    const len = wallLength(wall)
    if (!best) {
      best = { wall, dist, len }
      continue
    }
    if (dist < best.dist - 8) {
      best = { wall, dist, len }
      continue
    }
    if (Math.abs(dist - best.dist) <= 8 && len > best.len) {
      best = { wall, dist, len }
    }
  }
  return best ? { wall: best.wall, dist: best.dist } : null
}

/** Punch a door into an existing solid wall, close a door gap, or reuse an opening. */
export function insertOpeningOnWall(
  floorplan: Floorplan,
  x: number,
  y: number,
  widthCm = DEFAULT_DOOR_WIDTH_CM
): Wall | null {
  const gap = nearestDanglingGap(floorplan, x, y)
  const hit = nearestWallAt(floorplan, x, y)
  const gapCloser = Boolean(gap && (!hit || hit.dist > 12 || hit.dist >= gap.dist - 4))
  if (gap && (gapCloser || !hit || hit.dist > OPENING_SNAP_CM)) {
    return closeDanglingGap(floorplan, gap)
  }
  if (!hit || hit.dist > OPENING_SNAP_CM) return null
  const wall = hit.wall
  if (wall.opening) return wall

  const start = wall.getStart()
  const end = wall.getEnd()
  const len = Math.hypot(end.x - start.x, end.y - start.y)
  if (len < DOOR_GAP_MIN_CM * 1.2) {
    wall.opening = true
    floorplan.update()
    return wall
  }

  const dx = (end.x - start.x) / len
  const dy = (end.y - start.y) / len
  const at = Utils.closestPointOnLine(x, y, start.x, start.y, end.x, end.y)
  const along = (at.x - start.x) * dx + (at.y - start.y) * dy
  const half = Math.min(Math.max(widthCm, DOOR_GAP_MIN_CM), len * 0.85) / 2
  let a = Math.max(MIN_STUB_CM, along - half)
  let b = Math.min(len - MIN_STUB_CM, along + half)
  if (b - a < DOOR_GAP_MIN_CM) {
    const mid = (a + b) / 2
    a = Math.max(MIN_STUB_CM, mid - DOOR_GAP_MIN_CM / 2)
    b = Math.min(len - MIN_STUB_CM, mid + DOOR_GAP_MIN_CM / 2)
  }
  if (b <= a) {
    wall.opening = true
    floorplan.update()
    return wall
  }

  const j1x = start.x + dx * a
  const j1y = start.y + dy * a
  const j2x = start.x + dx * b
  const j2y = start.y + dy * b
  wall.remove()
  const exclude = [start, end]
  const j1 = jambCorner(floorplan, j1x, j1y, exclude)
  const j2 = jambCorner(floorplan, j2x, j2y, exclude)
  if (Math.hypot(j1.x - start.x, j1.y - start.y) >= MIN_STUB_CM && !start.wallToOrFrom(j1)) {
    floorplan.newWall(start, j1, { skipUpdate: true })
  }
  const opening = j1.wallToOrFrom(j2) ?? floorplan.newWall(j1, j2, { skipUpdate: true, opening: true })
  opening.opening = true
  if (Math.hypot(end.x - j2.x, end.y - j2.y) >= MIN_STUB_CM && !j2.wallToOrFrom(end)) {
    floorplan.newWall(j2, end, { skipUpdate: true })
  }
  floorplan.update()
  return opening
}

function jambCorner(floorplan: Floorplan, x: number, y: number, exclude: Corner[]): Corner {
  const hit = floorplan.overlappedCorner(x, y, 6)
  if (hit && !exclude.includes(hit)) return hit
  return floorplan.newCorner(x, y)
}

function closeDanglingGap(
  floorplan: Floorplan,
  gap: { a: Corner; b: Corner }
): Wall {
  const already = gap.a.wallToOrFrom(gap.b)
  if (already) {
    already.opening = true
    floorplan.update()
    return already
  }
  return floorplan.newWall(gap.a, gap.b, { opening: true })
}

/** Reuse a nearby wall, close a door gap, or create a short opening wall. */
export function ensureOpeningWallAt(
  floorplan: Floorplan,
  x: number,
  y: number,
  widthCm = DEFAULT_DOOR_WIDTH_CM
): Wall | null {
  const existing = nearestWallAt(floorplan, x, y)
  if (existing && existing.dist <= OPENING_SNAP_CM) {
    return existing.wall
  }

  const gap = nearestDanglingGap(floorplan, x, y)
  if (gap) {
    const already = gap.a.wallToOrFrom(gap.b)
    if (already) return already
    return floorplan.newWall(gap.a, gap.b, { opening: true })
  }

  const dir = inferOpeningDirection(floorplan, x, y)
  const half = Math.max(widthCm, DOOR_GAP_MIN_CM) / 2
  const x1 = x - dir.x * half
  const y1 = y - dir.y * half
  const x2 = x + dir.x * half
  const y2 = y + dir.y * half
  const c1 = floorplan.overlappedCorner(x1, y1, 15) ?? floorplan.newCorner(x1, y1)
  const c2 = floorplan.overlappedCorner(x2, y2, 15) ?? floorplan.newCorner(x2, y2)
  if (c1 === c2) return existing?.wall ?? null
  const already = c1.wallToOrFrom(c2)
  if (already) return already
  return floorplan.newWall(c1, c2, { opening: true })
}

function nearestDanglingGap(
  floorplan: Floorplan,
  x: number,
  y: number
): { a: Corner; b: Corner; dist: number } | null {
  const dangling = floorplan.getCorners().filter((corner) => corner.adjacentCorners().length === 1)
  let best: { a: Corner; b: Corner; dist: number } | null = null
  let bestDist = OPENING_SNAP_CM
  for (let i = 0; i < dangling.length; i++) {
    for (let j = i + 1; j < dangling.length; j++) {
      const a = dangling[i]
      const b = dangling[j]
      if (a.wallToOrFrom(b)) continue
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < DOOR_GAP_MIN_CM || len > DOOR_GAP_MAX_CM) continue
      const dist = Utils.pointDistanceFromLine(x, y, a.x, a.y, b.x, b.y)
      if (dist < bestDist) {
        bestDist = dist
        best = { a, b, dist }
      }
    }
  }
  return best
}

function inferOpeningDirection(floorplan: Floorplan, x: number, y: number): { x: number; y: number } {
  const near = nearestWallAt(floorplan, x, y)
  if (near) {
    const dx = near.wall.getEndX() - near.wall.getStartX()
    const dy = near.wall.getEndY() - near.wall.getStartY()
    const len = Math.hypot(dx, dy)
    if (len > 1e-6) return { x: dx / len, y: dy / len }
  }
  return { x: 1, y: 0 }
}

export function wallsAt(corner: Corner): Wall[] {
  const walls: Wall[] = []
  for (const neighbor of corner.adjacentCorners()) {
    const wall = corner.wallToOrFrom(neighbor)
    if (wall) walls.push(wall)
  }
  return walls
}

export function openingAtCorner(corner: Corner): Wall | null {
  return wallsAt(corner).find((wall) => wall.opening) ?? null
}

export function isOpeningOnlyCorner(corner: Corner): boolean {
  const walls = wallsAt(corner)
  return walls.length > 0 && walls.every((wall) => wall.opening)
}

/** Give an opening its own corner so dragging it does not move solid walls. */
export function isolateOpeningCorner(floorplan: Floorplan, wall: Wall, corner: Corner): Corner {
  if (!wall.opening) return corner
  const shared = wallsAt(corner).some((other) => other !== wall && !other.opening)
  if (!shared) return corner
  corner.keepOpen = true
  const fresh = floorplan.newCorner(corner.x, corner.y)
  if (wall.getStart() === corner) wall.setStart(fresh)
  else if (wall.getEnd() === corner) wall.setEnd(fresh)
  return fresh
}

export function isolateOpening(floorplan: Floorplan, wall: Wall): void {
  if (!wall.opening) return
  isolateOpeningCorner(floorplan, wall, wall.getStart())
  isolateOpeningCorner(floorplan, wall, wall.getEnd())
}

export function wallLength(wall: Wall): number {
  return Math.hypot(wall.getEndX() - wall.getStartX(), wall.getEndY() - wall.getStartY())
}

/** Length of the collinear wall run and how far this wall sits from the start. */
export function collinearRun(wall: Wall): { length: number; shift: number; ux: number; uy: number } {
  const sx = wall.getEndX() - wall.getStartX()
  const sy = wall.getEndY() - wall.getStartY()
  const len = Math.hypot(sx, sy)
  const ux = len > 1e-6 ? sx / len : 1
  const uy = len > 1e-6 ? sy / len : 0
  const back = walkCollinear(wall.getStart(), wall.getEnd(), -ux, -uy)
  const fwd = walkCollinear(wall.getEnd(), wall.getStart(), ux, uy)
  return { length: back + len + fwd, shift: back, ux, uy }
}

export function sharesCollinearRun(a: Wall, b: Wall): boolean {
  if (a === b) return true
  const run = collinearRun(a)
  const midX = (b.getStartX() + b.getEndX()) / 2
  const midY = (b.getStartY() + b.getEndY()) / 2
  const dist = Utils.pointDistanceFromLine(
    midX,
    midY,
    a.getStartX() - run.ux * run.shift,
    a.getStartY() - run.uy * run.shift,
    a.getStartX() - run.ux * run.shift + run.ux * run.length,
    a.getStartY() - run.uy * run.shift + run.uy * run.length
  )
  return dist < 12
}

/** Slide a door along its wall. Solid walls still translate freely. */
export function slideOpening(wall: Wall, dx: number, dy: number): void {
  if (!wall.opening) {
    wall.relativeMove(dx, dy)
    return
  }
  const run = collinearRun(wall)
  const len = wallLength(wall)
  const along = dx * run.ux + dy * run.uy
  if (Math.abs(along) < 1e-6) return
  if (run.length <= len + 1) {
    wall.relativeMove(run.ux * along, run.uy * along)
    return
  }
  const mid = run.shift + len / 2
  const half = len / 2
  const minMid = half + MIN_STUB_CM
  const maxMid = run.length - half - MIN_STUB_CM
  const next = Math.min(Math.max(mid + along, minMid), maxMid)
  const move = next - mid
  wall.relativeMove(run.ux * move, run.uy * move)
}

export function slideOpeningTo(wall: Wall, x: number, y: number): void {
  const run = collinearRun(wall)
  const originX = wall.getStartX() - run.ux * run.shift
  const originY = wall.getStartY() - run.uy * run.shift
  const along = (x - originX) * run.ux + (y - originY) * run.uy
  const mid = run.shift + wallLength(wall) / 2
  slideOpening(wall, run.ux * (along - mid), run.uy * (along - mid))
}

/** Fill a door/window gap as a solid wall instead of deleting it (gaps get re-closed). */
export function fillOpening(
  floorplan: Floorplan,
  wall: Wall,
  options?: { skipItems?: boolean }
): void {
  if (!wall.opening) {
    wall.remove()
    floorplan.update()
    return
  }
  const mid = {
    x: (wall.getStartX() + wall.getEndX()) / 2,
    y: (wall.getStartY() + wall.getEndY()) / 2
  }
  wall.opening = false
  forgetOpeningAt(floorplan, mid)
  if (!options?.skipItems) {
    for (const item of [...wall.items, ...wall.onItems]) {
      const meta = (item as { metadata?: { itemType?: number; itemKey?: string } }).metadata
      if (isDoorOrWindowMeta(meta)) {
        ;(item as { removeFromScene?: () => void }).removeFromScene?.()
      }
    }
  }
  floorplan.update()
}

export function forgetOpeningAt(floorplan: Floorplan, world: { x: number; y: number }): void {
  const placements = floorplan.detectedPlacements
  if (!placements?.openings?.length) return
  const map = floorplan.detectTransform
  placements.openings = placements.openings.filter((opening) => {
    const px = map ? map.originX + opening.x * map.cmPerImagePixel : opening.x
    const py = map ? map.originY + opening.y * map.cmPerImagePixel : opening.y
    return Math.hypot(px - world.x, py - world.y) > 60
  })
}

export function syncOpeningPlacement(floorplan: Floorplan, wall: Wall): void {
  const placements = floorplan.detectedPlacements
  const map = floorplan.detectTransform
  if (!placements?.openings?.length || !map) return
  const midX = (wall.getStartX() + wall.getEndX()) / 2
  const midY = (wall.getStartY() + wall.getEndY()) / 2
  let best = -1
  let bestDist = 80
  for (let i = 0; i < placements.openings.length; i++) {
    const opening = placements.openings[i]
    const px = map.originX + opening.x * map.cmPerImagePixel
    const py = map.originY + opening.y * map.cmPerImagePixel
    const dist = Math.hypot(px - midX, py - midY)
    if (dist < bestDist) {
      best = i
      bestDist = dist
    }
  }
  if (best < 0) return
  placements.openings[best] = {
    ...placements.openings[best],
    x: (midX - map.originX) / map.cmPerImagePixel,
    y: (midY - map.originY) / map.cmPerImagePixel
  }
}

function isDoorOrWindowMeta(meta?: { itemType?: number; itemKey?: string }): boolean {
  if (!meta) return false
  if (meta.itemType === 3 || meta.itemType === 7) return true
  const key = meta.itemKey ?? ''
  return key.startsWith('door') || key.startsWith('window')
}

function walkCollinear(from: Corner, cameFrom: Corner, dirx: number, diry: number): number {
  let total = 0
  let prev = cameFrom
  let cur = from
  for (let step = 0; step < 8; step++) {
    const next = collinearNeighbor(cur, prev, dirx, diry)
    if (!next) break
    total += Math.hypot(next.x - cur.x, next.y - cur.y)
    prev = cur
    cur = next
  }
  return total
}

function collinearNeighbor(
  corner: Corner,
  exclude: Corner,
  dirx: number,
  diry: number
): Corner | null {
  for (const neighbor of corner.adjacentCorners()) {
    if (neighbor === exclude) continue
    const dx = neighbor.x - corner.x
    const dy = neighbor.y - corner.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    if ((dx / len) * dirx + (dy / len) * diry > 0.92) return neighbor
  }
  return null
}
