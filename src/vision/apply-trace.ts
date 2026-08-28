import type { Model } from '../model/model'
import type { FloorplanOverlay } from '../floorplanner/overlay'
import { scaleOverlayToPixelWidth } from '../floorplanner/overlay'
import { savedFloorplanFromWorldSegments, worldSegmentsFromTrace } from './build-floorplan'
import type { WallTrace } from './types'

export function applyWallTraceToModel(
  model: Model,
  overlay: FloorplanOverlay,
  trace: WallTrace,
  overallWidthCm?: number,
  options?: { seedHistory?: boolean }
): number {
  if (overallWidthCm && overallWidthCm > 0) {
    const pixelWidth = Math.max(1, trace.bbox.maxX - trace.bbox.minX)
    scaleOverlayToPixelWidth(
      overlay,
      pixelWidth,
      overallWidthCm,
      (trace.bbox.minX + trace.bbox.maxX) / 2,
      (trace.bbox.minY + trace.bbox.maxY) / 2
    )
  }
  const worlds = worldSegmentsFromTrace(
    trace,
    overlay.originX,
    overlay.originY,
    overlay.cmPerImagePixel
  )
  const floorplan = savedFloorplanFromWorldSegments(worlds)
  model.loadSerialized(JSON.stringify({ floorplan, items: [] }), {
    seedHistory: options?.seedHistory !== false
  })
  return floorplan.walls.length
}
