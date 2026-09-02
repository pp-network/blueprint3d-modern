import { segmentLength, traceBBox } from './build-floorplan'
import type { PixelSegment, WallTrace } from './types'

/**
 * Finish must not redraw the stream skeleton.
 * Keep the last good preview; only append inner walls the final JSON added.
 */
export function finishWallTrace(preview: WallTrace | null, finished: WallTrace | null): WallTrace {
  if (preview && finished) {
    if (previewLooksIncomplete(preview, finished)) return finished
    return keepPreviewTrace(preview, finished)
  }
  const used = preview ?? finished
  if (!used) {
    throw new Error('没有可用的墙线')
  }
  return used
}

/** Stream only had an outer box; the finished parse is the first real plan. */
export function previewLooksIncomplete(preview: WallTrace, finished: WallTrace): boolean {
  const previewInner =
    preview.segments.length - Math.min(preview.outerCount ?? 0, preview.segments.length)
  const finishedInner =
    finished.segments.length - Math.min(finished.outerCount ?? 0, finished.segments.length)
  return previewInner === 0 && finishedInner >= 4 && finished.segments.length >= 12
}

/** Preserve preview geometry. Add unmatched finished inner walls, capped. */
export function keepPreviewTrace(preview: WallTrace, finished: WallTrace): WallTrace {
  const minDim = Math.min(preview.imageWidth || 1, preview.imageHeight || 1)
  const coverDist = Math.max(10, minDim * 0.014)
  const innerStart = Math.min(finished.outerCount ?? 0, finished.segments.length)
  const cap = Math.max(8, Math.ceil(preview.segments.length * 0.3))
  const extras: PixelSegment[] = []
  for (const seg of finished.segments.slice(innerStart)) {
    if (segmentLength(seg) < 8) continue
    if (nearAnySegment(seg, preview.segments, coverDist)) continue
    extras.push(seg)
    if (extras.length >= cap) break
  }
  if (extras.length === 0) return preview
  const segments = [...preview.segments, ...extras]
  return {
    ...preview,
    segments,
    bbox: traceBBox(segments)
  }
}

function nearAnySegment(seg: PixelSegment, others: PixelSegment[], maxDist: number): boolean {
  const mx = (seg.x1 + seg.x2) / 2
  const my = (seg.y1 + seg.y2) / 2
  for (const other of others) {
    if (pointSegDist(mx, my, other) <= maxDist) return true
    if (pointSegDist((other.x1 + other.x2) / 2, (other.y1 + other.y2) / 2, seg) <= maxDist) {
      return true
    }
  }
  return false
}

function pointSegDist(x: number, y: number, seg: PixelSegment): number {
  const dx = seg.x2 - seg.x1
  const dy = seg.y2 - seg.y1
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return Math.hypot(x - seg.x1, y - seg.y1)
  const t = Math.max(0, Math.min(1, ((x - seg.x1) * dx + (y - seg.y1) * dy) / len2))
  return Math.hypot(x - (seg.x1 + t * dx), y - (seg.y1 + t * dy))
}
