import { Utils } from '../core/utils'
import type { SavedFloorplan } from '../model/floorplan'
import type { PixelSegment, TraceBBox, WallTrace, WorldSegment } from './types'

export function segmentLength(s: { x1: number; y1: number; x2: number; y2: number }): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
}

export function traceBBox(segments: PixelSegment[]): TraceBBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of segments) {
    minX = Math.min(minX, s.x1, s.x2)
    minY = Math.min(minY, s.y1, s.y2)
    maxX = Math.max(maxX, s.x1, s.x2)
    maxY = Math.max(maxY, s.y1, s.y2)
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  return { minX, minY, maxX, maxY }
}

export function pixelToWorld(
  segment: PixelSegment,
  originX: number,
  originY: number,
  cmPerImagePixel: number
): WorldSegment {
  return {
    x1: originX + segment.x1 * cmPerImagePixel,
    y1: originY + segment.y1 * cmPerImagePixel,
    x2: originX + segment.x2 * cmPerImagePixel,
    y2: originY + segment.y2 * cmPerImagePixel
  }
}

export function worldSegmentsFromTrace(
  trace: WallTrace,
  originX: number,
  originY: number,
  cmPerImagePixel: number
): WorldSegment[] {
  return trace.segments.map((s) => pixelToWorld(s, originX, originY, cmPerImagePixel))
}

export function savedFloorplanFromWorldSegments(segments: WorldSegment[]): SavedFloorplan {
  const snap = snapTolerance(segments)
  const corners: Record<string, { x: number; y: number }> = {}
  const index: Array<{ id: string; x: number; y: number }> = []

  const cornerAt = (x: number, y: number): string => {
    for (const c of index) {
      if (Math.hypot(c.x - x, c.y - y) <= snap) {
        return c.id
      }
    }
    const id = Utils.guid()
    index.push({ id, x, y })
    corners[id] = { x, y }
    return id
  }

  const walls: SavedFloorplan['walls'] = []
  const seen = new Set<string>()
  for (const s of segments) {
    if (segmentLength(s) < snap * 0.5) {
      continue
    }
    const a = cornerAt(s.x1, s.y1)
    const b = cornerAt(s.x2, s.y2)
    if (a === b) {
      continue
    }
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    walls.push({ corner1: a, corner2: b })
  }

  return {
    corners,
    walls,
    wallTextures: [],
    floorTextures: {},
    newFloorTextures: {}
  }
}

function snapTolerance(segments: WorldSegment[]): number {
  const bbox = traceBBox(segments)
  const span = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
  return Math.max(8, span * 0.012)
}
