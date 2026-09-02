import { segmentLength, traceBBox } from './build-floorplan'
import type { PixelSegment, WallTrace } from './types'

/** Snap nearby X/Y values together so T-junctions and corners actually meet. */
export function stitchWallTrace(trace: WallTrace): WallTrace {
  if (trace.segments.length === 0) return trace
  const minDim = Math.min(trace.imageWidth || 1, trace.imageHeight || 1)
  const tol = Math.max(8, minDim * 0.01)
  const xs: number[] = []
  const ys: number[] = []
  for (const seg of trace.segments) {
    xs.push(seg.x1, seg.x2)
    ys.push(seg.y1, seg.y2)
  }
  const xMap = clusterAxis(xs, tol)
  const yMap = clusterAxis(ys, tol)
  const origOuter = Math.min(trace.outerCount ?? 0, trace.segments.length)
  const segments: PixelSegment[] = []
  let outerCount = 0
  for (let i = 0; i < trace.segments.length; i++) {
    const seg = trace.segments[i]
    const aligned = alignManhattan({
      x1: xMap.get(seg.x1) ?? seg.x1,
      y1: yMap.get(seg.y1) ?? seg.y1,
      x2: xMap.get(seg.x2) ?? seg.x2,
      y2: yMap.get(seg.y2) ?? seg.y2
    })
    if (segmentLength(aligned) < 3) continue
    segments.push(aligned)
    if (i < origOuter) outerCount += 1
  }
  const cleaned = mergeOverlappingAndDropJunk({ ...trace, segments, outerCount })
  return {
    ...cleaned,
    bbox: traceBBox(cleaned.segments)
  }
}

/** Merge stacked collinear copies (same line, overlapping). Drop leftover ticks that are not door jambs. */
export function mergeOverlappingAndDropJunk(trace: WallTrace): WallTrace {
  const outerCount = Math.min(trace.outerCount ?? 0, trace.segments.length)
  const outer = trace.segments.slice(0, outerCount)
  const inner = mergeOverlapping(trace.segments.slice(outerCount))
  const keptInner = inner.filter((seg) => !isOrphanTick(seg, inner, outer))
  const segments = [...outer, ...keptInner]
  return {
    ...trace,
    segments,
    outerCount,
    bbox: traceBBox(segments)
  }
}

function mergeOverlapping(inner: PixelSegment[]): PixelSegment[] {
  const groups = new Map<string, PixelSegment[]>()
  for (const seg of inner) {
    const key = lineKey(seg)
    const list = groups.get(key) ?? []
    list.push(seg)
    groups.set(key, list)
  }
  const out: PixelSegment[] = []
  for (const list of groups.values()) {
    const horiz = isHoriz(list[0])
    const intervals = list
      .map((seg) => {
        const a = horiz ? seg.x1 : seg.y1
        const b = horiz ? seg.x2 : seg.y2
        return { lo: Math.min(a, b), hi: Math.max(a, b), seg }
      })
      .sort((a, b) => a.lo - b.lo)
    let cur = intervals[0]
    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i]
      if (next.lo <= cur.hi + 2) {
        cur = { ...cur, hi: Math.max(cur.hi, next.hi) }
        continue
      }
      out.push(intervalToSeg(cur.lo, cur.hi, cur.seg, horiz))
      cur = next
    }
    out.push(intervalToSeg(cur.lo, cur.hi, cur.seg, horiz))
  }
  return out
}

function isOrphanTick(seg: PixelSegment, inner: PixelSegment[], outer: PixelSegment[]): boolean {
  const len = segmentLength(seg)
  if (len >= 28) return false
  const others = [...inner, ...outer].filter((other) => other !== seg)
  if (hasDoorJambPair(seg, others)) return false
  if (formsBearingJog(seg, others)) return false
  const ends = [
    { x: seg.x1, y: seg.y1 },
    { x: seg.x2, y: seg.y2 }
  ]
  const joints = ends.filter((p) => others.some((other) => touchesEndpoint(p, other, 4))).length
  return joints < 2
}

/** Short L-return on a long bearing wall has only one joint; keep it. */
function formsBearingJog(seg: PixelSegment, others: PixelSegment[]): boolean {
  if (segmentLength(seg) < 10) return false
  const horiz = isHoriz(seg)
  const ends = [
    { x: seg.x1, y: seg.y1 },
    { x: seg.x2, y: seg.y2 }
  ]
  return others.some((other) => {
    if (isHoriz(other) === horiz) return false
    if (segmentLength(other) < 50) return false
    return ends.some((p) => touchesEndpoint(p, other, 6))
  })
}

function hasDoorJambPair(seg: PixelSegment, others: PixelSegment[]): boolean {
  const horiz = isHoriz(seg)
  for (const other of others) {
    if (isHoriz(other) !== horiz) continue
    if (lineKey(seg) !== lineKey(other)) continue
    const a1 = horiz ? Math.min(seg.x1, seg.x2) : Math.min(seg.y1, seg.y2)
    const a2 = horiz ? Math.max(seg.x1, seg.x2) : Math.max(seg.y1, seg.y2)
    const b1 = horiz ? Math.min(other.x1, other.x2) : Math.min(other.y1, other.y2)
    const b2 = horiz ? Math.max(other.x1, other.x2) : Math.max(other.y1, other.y2)
    const gap = Math.max(b1 - a2, a1 - b2)
    if (gap >= 32 && gap <= 90) return true
  }
  return false
}

function isHoriz(seg: PixelSegment): boolean {
  return Math.abs(seg.x2 - seg.x1) >= Math.abs(seg.y2 - seg.y1)
}

function lineKey(seg: PixelSegment): string {
  if (isHoriz(seg)) return `h:${Math.round((seg.y1 + seg.y2) / 2)}`
  return `v:${Math.round((seg.x1 + seg.x2) / 2)}`
}

function intervalToSeg(lo: number, hi: number, sample: PixelSegment, horiz: boolean): PixelSegment {
  if (horiz) {
    const y = (sample.y1 + sample.y2) / 2
    return { x1: lo, y1: y, x2: hi, y2: y }
  }
  const x = (sample.x1 + sample.x2) / 2
  return { x1: x, y1: lo, x2: x, y2: hi }
}

function touchesEndpoint(p: { x: number; y: number }, seg: PixelSegment, tol: number): boolean {
  return (
    Math.hypot(p.x - seg.x1, p.y - seg.y1) <= tol || Math.hypot(p.x - seg.x2, p.y - seg.y2) <= tol
  )
}

function clusterAxis(values: number[], tol: number): Map<number, number> {
  const sorted = [...values].sort((a, b) => a - b)
  const map = new Map<number, number>()
  let group: number[] = []
  const flush = () => {
    if (group.length === 0) return
    const mid = group[Math.floor(group.length / 2)]
    for (const value of group) map.set(value, mid)
    group = []
  }
  for (const value of sorted) {
    if (group.length === 0 || value - group[group.length - 1] <= tol) {
      group.push(value)
    } else {
      flush()
      group.push(value)
    }
  }
  flush()
  return map
}

function alignManhattan(seg: PixelSegment): PixelSegment {
  if (Math.abs(seg.x2 - seg.x1) >= Math.abs(seg.y2 - seg.y1)) {
    const y = (seg.y1 + seg.y2) / 2
    return { x1: seg.x1, y1: y, x2: seg.x2, y2: y }
  }
  const x = (seg.x1 + seg.x2) / 2
  return { x1: x, y1: seg.y1, x2: x, y2: seg.y2 }
}
