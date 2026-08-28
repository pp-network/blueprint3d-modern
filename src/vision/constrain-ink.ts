import { rasterizeImage, type TraceImageData } from './trace-walls'
import { segmentLength, traceBBox } from './build-floorplan'
import type { PixelSegment, WallTrace } from './types'

export function constrainTraceToImage(trace: WallTrace, image: HTMLImageElement): WallTrace {
  const { imageData, scale } = rasterizeImage(image)
  const inv = scale > 0 ? 1 / scale : 1
  const scaled: WallTrace = {
    ...trace,
    segments: trace.segments.map((s) => ({
      x1: s.x1 * scale,
      y1: s.y1 * scale,
      x2: s.x2 * scale,
      y2: s.y2 * scale
    })),
    imageWidth: imageData.width,
    imageHeight: imageData.height
  }
  const filtered = constrainTraceToInk(scaled, imageData)
  const segments = filtered.segments.map((s) => ({
    x1: s.x1 * inv,
    y1: s.y1 * inv,
    x2: s.x2 * inv,
    y2: s.y2 * inv
  }))
  return {
    ...filtered,
    segments,
    bbox: traceBBox(segments),
    imageWidth: trace.imageWidth,
    imageHeight: trace.imageHeight
  }
}

export function constrainTraceToInk(
  trace: WallTrace,
  image: TraceImageData,
  options?: { radius?: number; innerMinSupport?: number; outerMinSupport?: number }
): WallTrace {
  const radius = options?.radius ?? 4
  const innerMin = options?.innerMinSupport ?? 0.4
  const outerMin = options?.outerMinSupport ?? 0.18
  const mask = dilatedInkMask(image, radius)
  const outerCount = Math.min(trace.outerCount ?? 0, trace.segments.length)
  const kept: PixelSegment[] = []
  let keptOuter = 0
  for (let i = 0; i < trace.segments.length; i++) {
    const seg = trace.segments[i]
    const isOuter = i < outerCount
    const support = segmentInkSupport(seg, mask, image.width, image.height)
    if (support >= (isOuter ? outerMin : innerMin)) {
      kept.push(seg)
      if (isOuter) keptOuter++
    }
  }
  if (outerCount >= 4 && keptOuter < 4) {
    return {
      ...trace,
      segments: [
        ...trace.segments.slice(0, outerCount),
        ...kept.slice(keptOuter)
      ],
      outerCount
    }
  }
  return {
    ...trace,
    segments: kept,
    bbox: traceBBox(kept),
    outerCount: keptOuter
  }
}

/** Add long local-ink walls that the model missed. Skip short CV fragments. */
export function mergeMissedInkWalls(ai: WallTrace, local: WallTrace): WallTrace {
  const minDim = Math.min(ai.imageWidth, ai.imageHeight)
  const minLen = Math.max(24, minDim * 0.08)
  const veryLong = Math.max(40, minDim * 0.18)
  const joinDist = Math.max(12, minDim * 0.02)
  const extra: PixelSegment[] = []
  for (const seg of local.segments) {
    const len = segmentLength(seg)
    if (len < minLen) continue
    if (nearAny(seg, ai.segments, Math.max(10, minDim * 0.012))) continue
    // Isolated furniture edges sit in the room; missed partitions join the skeleton.
    if (len < veryLong && !nearEndpoint(seg, ai.segments, joinDist)) continue
    extra.push(seg)
  }
  if (extra.length === 0) return ai
  const segments = [...ai.segments, ...extra]
  return dropCabinetLikeWalls({ ...ai, segments, bbox: traceBBox(segments) })
}

/**
 * Drop clusters of short parallel inner walls (closet shelves / cabinet combs).
 * Keeps the closet room shell and isolated short partitions.
 */
export function dropCabinetLikeWalls(trace: WallTrace): WallTrace {
  const outerCount = Math.min(trace.outerCount ?? 0, trace.segments.length)
  const outer = trace.segments.slice(0, outerCount)
  const inner = trace.segments.slice(outerCount)
  if (inner.length < 3) return trace
  const minDim = Math.min(trace.imageWidth, trace.imageHeight)
  const maxLen = Math.max(28, minDim * 0.18)
  const maxSpacing = Math.max(10, minDim * 0.045)
  const candidates = inner
    .map((seg, i) => ({ i, seg, len: segmentLength(seg), horiz: isHoriz(seg) }))
    .filter((c) => c.len <= maxLen)
  const parent = candidates.map((_, i) => i)
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]
      if (a.horiz !== b.horiz) continue
      if (Math.abs(a.len - b.len) > Math.max(12, a.len * 0.5)) continue
      if (!parallelCloseOverlap(a.seg, b.seg, a.horiz, maxSpacing)) continue
      union(i, j)
    }
  }
  const sizes = new Map<number, number>()
  for (let i = 0; i < candidates.length; i++) {
    const root = find(i)
    sizes.set(root, (sizes.get(root) ?? 0) + 1)
  }
  const drop = new Set<number>()
  for (let i = 0; i < candidates.length; i++) {
    if ((sizes.get(find(i)) ?? 0) >= 3) drop.add(candidates[i].i)
  }

  if (drop.size === 0) return trace
  const keptInner = inner.filter((_, i) => !drop.has(i))
  const segments = [...outer, ...keptInner]
  return {
    ...trace,
    segments,
    bbox: traceBBox(segments),
    outerCount
  }
}

function dilatedInkMask(image: TraceImageData, radius: number): Uint8Array {
  const { data, width, height } = image
  const total = width * height
  const gray = new Uint8Array(total)
  let sum = 0
  for (let i = 0; i < total; i++) {
    const o = i * 4
    const g = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
    gray[i] = g
    sum += g
  }
  const mean = sum / total
  const invert = mean < 128
  const mask = new Uint8Array(total)
  const cut = invert ? 200 : 90
  for (let i = 0; i < total; i++) {
    mask[i] = (invert ? gray[i] >= cut : gray[i] <= cut) ? 1 : 0
  }
  if (radius <= 0) return mask
  const out = new Uint8Array(total)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= width) continue
          if (mask[yy * width + xx]) {
            hit = 1
            break
          }
        }
      }
      out[y * width + x] = hit
    }
  }
  return out
}

function segmentInkSupport(seg: PixelSegment, mask: Uint8Array, width: number, height: number): number {
  const samples = 14
  let hit = 0
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const x = Math.round(seg.x1 + (seg.x2 - seg.x1) * t)
    const y = Math.round(seg.y1 + (seg.y2 - seg.y1) * t)
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    if (mask[y * width + x]) hit++
  }
  return hit / (samples + 1)
}

function nearEndpoint(seg: PixelSegment, others: PixelSegment[], maxDist: number): boolean {
  for (const other of others) {
    if (Math.hypot(seg.x1 - other.x1, seg.y1 - other.y1) <= maxDist) return true
    if (Math.hypot(seg.x1 - other.x2, seg.y1 - other.y2) <= maxDist) return true
    if (Math.hypot(seg.x2 - other.x1, seg.y2 - other.y1) <= maxDist) return true
    if (Math.hypot(seg.x2 - other.x2, seg.y2 - other.y2) <= maxDist) return true
  }
  return false
}

function isHoriz(seg: PixelSegment): boolean {
  return Math.abs(seg.x2 - seg.x1) >= Math.abs(seg.y2 - seg.y1)
}

function parallelCloseOverlap(
  a: PixelSegment,
  b: PixelSegment,
  horiz: boolean,
  maxSpacing: number
): boolean {
  if (horiz) {
    const ay = (a.y1 + a.y2) / 2
    const by = (b.y1 + b.y2) / 2
    if (Math.abs(ay - by) > maxSpacing) return false
    return rangeOverlap(a.x1, a.x2, b.x1, b.x2) >= 0.45
  }
  const ax = (a.x1 + a.x2) / 2
  const bx = (b.x1 + b.x2) / 2
  if (Math.abs(ax - bx) > maxSpacing) return false
  return rangeOverlap(a.y1, a.y2, b.y1, b.y2) >= 0.45
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  const as = Math.min(a1, a2)
  const ae = Math.max(a1, a2)
  const bs = Math.min(b1, b2)
  const be = Math.max(b1, b2)
  const overlap = Math.min(ae, be) - Math.max(as, bs)
  const span = Math.min(ae - as, be - bs)
  if (span <= 1e-6) return 0
  return overlap / span
}

function nearAny(seg: PixelSegment, others: PixelSegment[], maxDist: number): boolean {
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
  let t = ((x - seg.x1) * dx + (y - seg.y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (seg.x1 + t * dx), y - (seg.y1 + t * dy))
}
