import * as THREE from 'three'
import type { Model } from '../model/model'
import type { Room } from '../model/room'
import type { DetectedPlacements, DetectTransform } from '../model/floorplan'
import { Utils } from '../core/utils'
import type { FloorplanOverlay } from '../floorplanner/overlay'
import { catalogItemForKind } from './catalog-pick'
import type { DetectedPoint, FloorplanPlacements } from './ai-walls-schema'
import { judgeDoorAccess, otherRoomAcross, wallsOfRoom } from '../model/door-access'
import { ensureOpeningWallAt, insertOpeningOnWall, nearestWallAt, wallLength } from '../model/opening-wall'

export interface PlaceFindingsResult {
  furniture: number
  doors: number
  windows: number
}

export function pixelToWorldPoint(
  x: number,
  y: number,
  originX: number,
  originY: number,
  cmPerImagePixel: number
): { x: number; y: number } {
  return {
    x: originX + x * cmPerImagePixel,
    y: originY + y * cmPerImagePixel
  }
}

export function overlayTransformOf(overlay: FloorplanOverlay): DetectTransform {
  return {
    originX: overlay.originX,
    originY: overlay.originY,
    cmPerImagePixel: overlay.cmPerImagePixel
  }
}

export function matchRoomName(room: Room, labels: DetectedPoint[]): string | undefined {
  const hits = labels.filter((label) => Utils.pointInPolygon(label.x, label.y, room.interiorCorners))
  if (hits.length === 0) return undefined
  const center = room.getCenter2D()
  hits.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
  return hits[0].name || undefined
}

export function applyRoomLabels(model: Model, worldRooms: DetectedPoint[]): void {
  model.floorplan.roomLabels = worldRooms.filter((room) => room.name && !isRoomDirectoryName(room.name))
  model.floorplan.relabelRooms()
}

function isRoomDirectoryName(name: string): boolean {
  const parts = name.split(/[\/／、]/).map((part) => part.trim()).filter(Boolean)
  return parts.length >= 3
}

/** Named rooms whose label is not inside any closed wall loop. */
export function unclosedRoomNames(floorplan: { getRooms(): Room[]; roomLabels?: DetectedPoint[] }): string[] {
  const rooms = floorplan.getRooms()
  const missing: string[] = []
  const seen = new Set<string>()
  for (const label of floorplan.roomLabels ?? []) {
    const name = label.name?.trim()
    if (!name || seen.has(name)) continue
    const inside = rooms.some((room) => Utils.pointInPolygon(label.x, label.y, room.interiorCorners))
    if (!inside) {
      seen.add(name)
      missing.push(name)
    }
  }
  return missing
}

export function rememberDetectedScene(
  model: Model,
  overlay: FloorplanOverlay | DetectTransform | null,
  placements: FloorplanPlacements | DetectedPlacements | null
): void {
  const transform = overlay
    ? 'image' in overlay
      ? overlayTransformOf(overlay)
      : overlay
    : model.floorplan.detectTransform
  if (transform) {
    model.floorplan.detectTransform = transform
  }
  if (placements) {
    model.floorplan.detectedPlacements = placements
  }
  const data = placements ?? model.floorplan.detectedPlacements
  const map = transform ?? model.floorplan.detectTransform
  if (data && map) {
    applyRoomLabels(
      model,
      data.rooms.map((room) => ({
        ...room,
        ...pixelToWorldPoint(room.x, room.y, map.originX, map.originY, map.cmPerImagePixel)
      }))
    )
  } else {
    model.floorplan.relabelRooms()
  }
}

/** Host door findings onto the nearest wall, then cut any still-sealed named rooms. */
export function punchDetectedOpenings(model: Model): number {
  const data = model.floorplan.detectedPlacements
  const map = model.floorplan.detectTransform
  if (!data || !map || typeof model.floorplan.getWalls !== 'function') return 0
  if (model.floorplan.getWalls().length === 0) return 0
  let n = 0
  for (const opening of data.openings ?? []) {
    const isDoor = opening.kind === 'door' || /门/.test(opening.name ?? '')
    if (!isDoor) continue
    const world = pixelToWorldPoint(opening.x, opening.y, map.originX, map.originY, map.cmPerImagePixel)
    const hosted = hostOpeningOnNearestWall(model.floorplan, world.x, world.y)
    if (hosted) n += 1
  }
  n += ensureSealedRoomsHaveDoors(model)
  return n
}

const HOST_SNAP_CM = 160

function hostOpeningOnNearestWall(floorplan: Model['floorplan'], x: number, y: number) {
  const hit = nearestWallAt(floorplan, x, y)
  if (!hit || hit.dist > HOST_SNAP_CM) {
    return null
  }
  const start = { x: hit.wall.getStartX(), y: hit.wall.getStartY() }
  const end = { x: hit.wall.getEndX(), y: hit.wall.getEndY() }
  const at = closestPointOnSegment(x, y, start.x, start.y, end.x, end.y)
  return insertOpeningOnWall(floorplan, at.x, at.y)
}

function closestPointOnSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number } {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return { x: x1, y: y1 }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2))
  return { x: x1 + dx * t, y: y1 + dy * t }
}

/** Cut a door in named rooms that are still a closed solid loop. */
export function ensureSealedRoomsHaveDoors(model: Model): number {
  const floorplan = model.floorplan
  if (typeof floorplan.getRooms !== 'function') return 0
  const sealed = judgeDoorAccess(floorplan).roomsWithoutDoor
  if (sealed.length === 0) return 0
  let n = 0
  for (const room of floorplan.getRooms()) {
    const name = room.name?.trim()
    if (!name || !sealed.includes(name)) continue
    const wall = pickDoorWall(floorplan, room)
    if (!wall) continue
    const x = (wall.getStartX() + wall.getEndX()) / 2
    const y = (wall.getStartY() + wall.getEndY()) / 2
    if (insertOpeningOnWall(floorplan, x, y)) n += 1
  }
  return n
}

function pickDoorWall(floorplan: Model['floorplan'], room: Room) {
  const walls = wallsOfRoom(room).filter((wall) => !wall.opening)
  if (walls.length === 0) return null
  const ranked = walls
    .map((wall) => ({
      wall,
      len: wallLength(wall),
      interior: Boolean(otherRoomAcross(floorplan, room, wall))
    }))
    .filter((item) => item.interior && item.len >= 60 && item.len <= 420)
    .sort((a, b) => a.len - b.len)
  return ranked[0]?.wall ?? null
}

export function isOpeningItem(item: { metadata: { itemType?: number; itemKey?: string } }): boolean {
  const type = item.metadata.itemType
  if (type === 3 || type === 7) return true
  const key = item.metadata.itemKey ?? ''
  return key.startsWith('door') || key.startsWith('window')
}

export function hasAutoPlacedOpenings(model: Model): boolean {
  return model.scene.getItems().some((item) => item.metadata.autoPlaced && isOpeningItem(item))
}

export function placeDetectedScene(
  model: Model,
  overlay: FloorplanOverlay | null,
  placements: FloorplanPlacements | null,
  options?: { furniture?: boolean; openings?: boolean }
): PlaceFindingsResult {
  const result: PlaceFindingsResult = { furniture: 0, doors: 0, windows: 0 }
  const reserved: Array<{ x: number; y: number }> = []
  const transform = overlay ? overlayTransformOf(overlay) : model.floorplan.detectTransform
  const data = placements ?? model.floorplan.detectedPlacements
  if (!transform || !data) {
    return result
  }

  rememberDetectedScene(model, transform, data)

  if (options?.furniture !== false) {
    const furniture = (data.furniture ?? []).slice(0, 20)
    for (const item of furniture) {
      const catalog = catalogItemForKind(item.kind, item.name)
      if (!catalog || catalog.category === 'door' || catalog.category === 'window') continue
      const world = pixelToWorldPoint(item.x, item.y, transform.originX, transform.originY, transform.cmPerImagePixel)
      addCatalogItem(model, catalog, world.x, world.y, reserved)
      result.furniture += 1
    }
  }

  if (options?.openings !== false) {
    const openings = (data.openings ?? []).slice(0, 24)
    for (const opening of openings) {
      const catalog = catalogItemForKind(opening.kind, opening.name)
      if (!catalog) continue
      const world = pixelToWorldPoint(
        opening.x,
        opening.y,
        transform.originX,
        transform.originY,
        transform.cmPerImagePixel
      )
      ensureOpeningWallAt(model.floorplan, world.x, world.y)
      addCatalogItem(model, catalog, world.x, world.y, reserved)
      if (catalog.category === 'door') result.doors += 1
      if (catalog.category === 'window') result.windows += 1
    }
  }
  return result
}

export function clearAutoPlacedItems(model: Model): void {
  for (const item of [...model.scene.getItems()]) {
    if (item.metadata.autoPlaced) {
      item.removeFromScene()
    }
  }
}

function addCatalogItem(
  model: Model,
  catalog: { name: string; key: string; model: string; type: string; description?: string; category?: string },
  x: number,
  y: number,
  reserved: Array<{ x: number; y: number }>
): void {
  reserved.push({ x, y })
  const metadata = {
    itemName: catalog.name,
    itemKey: catalog.key,
    resizable: true,
    modelUrl: catalog.model,
    itemType: parseInt(catalog.type, 10),
    description: catalog.description,
    autoPlaced: true
  }
  model.scene.addItem(
    parseInt(catalog.type, 10),
    catalog.model,
    metadata,
    new THREE.Vector3(x, catalog.category === 'window' ? 140 : 0, y)
  )
}
