import type { Model } from '../model/model'
import type { FloorplanOverlay } from '../floorplanner/overlay'
import { scaleOverlayToPixelWidth } from '../floorplanner/overlay'
import { savedFloorplanFromWorldSegments, worldSegmentsFromTrace } from './build-floorplan'
import { stitchWallTrace } from './stitch-walls'
import type { WallTrace } from './types'

/** 图纸总宽对应整张图，不能用认出的那几段墙的包围盒，否则外墙会按内墙框被拉飞。 */
export function overlayScaleFromTrace(
  trace: Pick<WallTrace, 'bbox' | 'imageWidth' | 'imageHeight'>
): { pixelWidth: number; centerX: number; centerY: number } {
  const imageWidth = Math.max(0, trace.imageWidth || 0)
  const imageHeight = Math.max(0, trace.imageHeight || 0)
  if (imageWidth >= 8 && imageHeight >= 8) {
    return { pixelWidth: imageWidth, centerX: imageWidth / 2, centerY: imageHeight / 2 }
  }
  const pixelWidth = Math.max(1, trace.bbox.maxX - trace.bbox.minX)
  return {
    pixelWidth,
    centerX: (trace.bbox.minX + trace.bbox.maxX) / 2,
    centerY: (trace.bbox.minY + trace.bbox.maxY) / 2
  }
}

export function applyWallTraceToModel(
  model: Model,
  overlay: FloorplanOverlay,
  trace: WallTrace,
  overallWidthCm?: number,
  options?: { seedHistory?: boolean }
): number {
  if (overallWidthCm && overallWidthCm > 0) {
    const scale = overlayScaleFromTrace(trace)
    scaleOverlayToPixelWidth(overlay, scale.pixelWidth, overallWidthCm, scale.centerX, scale.centerY)
  }
  const stitched = stitchWallTrace(trace)
  const worlds = worldSegmentsFromTrace(
    stitched,
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
