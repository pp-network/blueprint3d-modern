import { rasterizeImage, traceWallsFromImage, type TraceImageData } from './trace-walls'
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

/** Nudge wall centerlines onto nearby CAD ink so traces sit on the drawn walls. */
export function snapTraceToImage(trace: WallTrace, image: HTMLImageElement): WallTrace {
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
  const snapped = snapTraceToInk(scaled, imageData)
  const segments = snapped.segments.map((s) => ({
    x1: s.x1 * inv,
    y1: s.y1 * inv,
    x2: s.x2 * inv,
    y2: s.y2 * inv
  }))
  return {
    ...snapped,
    segments,
    bbox: traceBBox(segments),
    imageWidth: trace.imageWidth,
    imageHeight: trace.imageHeight
  }
}

export function snapTraceToInk(
  trace: WallTrace,
  image: TraceImageData,
  options?: { radius?: number }
): WallTrace {
  const radius = options?.radius ?? 10
  const mask = inkMask(image)
  const segments = trace.segments.map((seg) =>
    snapSegmentToInk(seg, mask, image.width, image.height, radius)
  )
  return {
    ...trace,
    segments,
    bbox: traceBBox(segments)
  }
}

function snapSegmentToInk(
  seg: PixelSegment,
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): PixelSegment {
  const dx = seg.x2 - seg.x1
  const dy = seg.y2 - seg.y1
  const len = Math.hypot(dx, dy)
  if (len < 4) return seg
  const px = -dy / len
  const py = dx / len
  let bestOff = 0
  let bestScore = -1
  for (let off = -radius; off <= radius; off++) {
    const shifted = {
      x1: seg.x1 + px * off,
      y1: seg.y1 + py * off,
      x2: seg.x2 + px * off,
      y2: seg.y2 + py * off
    }
    const score = segmentInkSupport(shifted, mask, width, height)
    const closer = Math.abs(score - bestScore) <= 0.02 && Math.abs(off) < Math.abs(bestOff)
    if (score > bestScore + 0.02 || closer) {
      bestScore = score
      bestOff = off
    }
  }
  if (bestScore < 0.25 || bestOff === 0) return seg
  return {
    x1: seg.x1 + px * bestOff,
    y1: seg.y1 + py * bestOff,
    x2: seg.x2 + px * bestOff,
    y2: seg.y2 + py * bestOff
  }
}

/** Keep ink filtering only if it does not wipe most partitions. */
export function shouldKeepInkConstrained(original: WallTrace, grounded: WallTrace): boolean {
  const origOuter = Math.min(original.outerCount ?? 0, original.segments.length)
  const groundOuter = Math.min(grounded.outerCount ?? 0, grounded.segments.length)
  const origInner = Math.max(0, original.segments.length - origOuter)
  const groundInner = Math.max(0, grounded.segments.length - groundOuter)
  if (groundOuter < Math.min(4, origOuter)) return false
  if (origInner === 0) return true
  return groundInner / origInner >= 0.5
}

export function constrainTraceToInk(
  trace: WallTrace,
  image: TraceImageData,
  options?: { radius?: number; innerMinSupport?: number; outerMinSupport?: number }
): WallTrace {
  const radius = options?.radius ?? 4
  const innerMin = options?.innerMinSupport ?? 0.4
  const mask = dilatedInkMask(image, radius)
  const outerCount = Math.min(trace.outerCount ?? 0, trace.segments.length)
  const kept: PixelSegment[] = []
  let keptOuter = 0
  for (let i = 0; i < trace.segments.length; i++) {
    const seg = trace.segments[i]
    const isOuter = i < outerCount
    if (isOuter) {
      kept.push(seg)
      keptOuter += 1
      continue
    }
    const support = segmentInkSupport(seg, mask, image.width, image.height)
    if (support >= innerMin) {
      kept.push(seg)
    }
  }
  return {
    ...trace,
    segments: kept,
    bbox: traceBBox(kept),
    outerCount: keptOuter
  }
}

/** Host thick CAD ink the model missed onto the AI skeleton (L-returns and partitions). */
export function complementThickInkFromImage(ai: WallTrace, image: HTMLImageElement): WallTrace {
  const local = traceWallsFromImage(image)
  const { imageData, scale } = rasterizeImage(image)
  const inv = scale > 0 ? 1 / scale : 1
  const toRaster = (s: PixelSegment): PixelSegment => ({
    x1: s.x1 * scale,
    y1: s.y1 * scale,
    x2: s.x2 * scale,
    y2: s.y2 * scale
  })
  const complemented = complementThickInkWalls(
    {
      ...ai,
      segments: ai.segments.map(toRaster),
      imageWidth: imageData.width,
      imageHeight: imageData.height
    },
    {
      ...local,
      segments: local.segments.map(toRaster),
      imageWidth: imageData.width,
      imageHeight: imageData.height
    },
    imageData
  )
  const segments = complemented.segments.map((s) => ({
    x1: s.x1 * inv,
    y1: s.y1 * inv,
    x2: s.x2 * inv,
    y2: s.y2 * inv
  }))
  return {
    ...complemented,
    segments,
    bbox: traceBBox(segments),
    imageWidth: ai.imageWidth,
    imageHeight: ai.imageHeight
  }
}

export function complementThickInkWalls(
  ai: WallTrace,
  local: WallTrace,
  image: TraceImageData
): WallTrace {
  const minDim = Math.min(ai.imageWidth || image.width, ai.imageHeight || image.height)
  const coverDist = Math.max(8, minDim * 0.012)
  const joinDist = Math.max(10, minDim * 0.018)
  const longMin = Math.max(28, minDim * 0.05)
  const ink = inkMask(image)
  const extra: PixelSegment[] = []
  for (const seg of local.segments) {
    if (nearAny(seg, ai.segments, coverDist)) continue
    if (!isThickBearingInk(seg, ink, image.width, image.height)) continue
    const len = segmentLength(seg)
    const lJog = isShortBearingJog(seg, ai.segments, minDim)
    if (!lJog && len < longMin) continue
    if (!lJog && !nearEndpoint(seg, ai.segments, joinDist)) continue
    extra.push(seg)
  }
  if (extra.length === 0) return ai
  const segments = [...ai.segments, ...extra]
  return dropCabinetLikeWalls({ ...ai, segments, bbox: traceBBox(segments) })
}

function isThickBearingInk(
  seg: PixelSegment,
  mask: Uint8Array,
  width: number,
  height: number
): boolean {
  if (isThinAnnotation(seg, mask, width, height)) return false
  const dx = seg.x2 - seg.x1
  const dy = seg.y2 - seg.y1
  const len = Math.hypot(dx, dy)
  if (len < 8) return false
  const px = len > 1e-6 ? -dy / len : 0
  const py = len > 1e-6 ? dx / len : 1
  let thick = 0
  const samples = Math.max(3, Math.min(7, Math.round(len / 12)))
  for (let i = 1; i < samples; i++) {
    const t = i / samples
    const profile = perpProfile(
      seg.x1 + dx * t,
      seg.y1 + dy * t,
      px,
      py,
      mask,
      width,
      height,
      12
    )
    if (profile.runs >= 2 || profile.width >= 5) thick += 1
  }
  return thick >= Math.max(1, Math.ceil((samples - 1) * 0.5))
}

function isShortBearingJog(seg: PixelSegment, others: PixelSegment[], minDim: number): boolean {
  const len = segmentLength(seg)
  if (len < 12 || len > Math.max(40, minDim * 0.22)) return false
  const horiz = isHoriz(seg)
  const ends = [
    { x: seg.x1, y: seg.y1 },
    { x: seg.x2, y: seg.y2 }
  ]
  return others.some((other) => {
    if (isHoriz(other) === horiz) return false
    if (segmentLength(other) < 50) return false
    const otherEnds = [
      { x: other.x1, y: other.y1 },
      { x: other.x2, y: other.y2 }
    ]
    return ends.some((p) => otherEnds.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 12))
  })
}

/** Add long local-ink walls that the model missed. Skip short CV fragments. */
export function mergeMissedInkWalls(ai: WallTrace, local: WallTrace): WallTrace {
  const minDim = Math.min(ai.imageWidth, ai.imageHeight)
  const minLen = Math.max(24, minDim * 0.08)
  const joinDist = Math.max(12, minDim * 0.02)
  const extra: PixelSegment[] = []
  for (const seg of local.segments) {
    const len = segmentLength(seg)
    if (len < minLen) continue
    if (nearAny(seg, ai.segments, Math.max(10, minDim * 0.012))) continue
    if (!nearEndpoint(seg, ai.segments, joinDist)) continue
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

export function dropThinDimensionWallsFromImage(trace: WallTrace, image: HTMLImageElement): WallTrace {
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
  const dropped = dropThinDimensionWalls(scaled, imageData)
  const segments = dropped.segments.map((s) => ({
    x1: s.x1 * inv,
    y1: s.y1 * inv,
    x2: s.x2 * inv,
    y2: s.y2 * inv
  }))
  return {
    ...dropped,
    segments,
    bbox: traceBBox(segments),
    imageWidth: trace.imageWidth,
    imageHeight: trace.imageHeight
  }
}

/** Drop inner walls that sit on a single thin ink ridge (dimension / 开间 ticks). Keep thick or double-line walls. */
export function dropThinDimensionWalls(trace: WallTrace, image: TraceImageData): WallTrace {
  const outerCount = Math.min(trace.outerCount ?? 0, trace.segments.length)
  const outer = trace.segments.slice(0, outerCount)
  const inner = trace.segments.slice(outerCount)
  if (inner.length === 0) return trace
  const ink = inkMask(image)
  const keptInner = inner.filter((seg) => !isThinAnnotation(seg, ink, image.width, image.height))
  if (keptInner.length === inner.length) return trace
  const segments = [...outer, ...keptInner]
  return {
    ...trace,
    segments,
    bbox: traceBBox(segments),
    outerCount
  }
}

function inkMask(image: TraceImageData): Uint8Array {
  const { data, width, height } = image
  const total = width * height
  let sum = 0
  const gray = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    const o = i * 4
    const g = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
    gray[i] = g
    sum += g
  }
  const invert = sum / total < 128
  const cut = invert ? 200 : 90
  const mask = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    mask[i] = (invert ? gray[i] >= cut : gray[i] <= cut) ? 1 : 0
  }
  return mask
}

function isThinAnnotation(seg: PixelSegment, mask: Uint8Array, width: number, height: number): boolean {
  const dx = seg.x2 - seg.x1
  const dy = seg.y2 - seg.y1
  const len = Math.hypot(dx, dy)
  if (len < 24) return false
  const px = len > 1e-6 ? -dy / len : 0
  const py = len > 1e-6 ? dx / len : 1
  let thin = 0
  let structural = 0
  const samples = 5
  for (let i = 1; i < samples; i++) {
    const t = i / samples
    const x = seg.x1 + dx * t
    const y = seg.y1 + dy * t
    const profile = perpProfile(x, y, px, py, mask, width, height, 12)
    if (profile.runs >= 2) {
      structural += 1
      continue
    }
    if (profile.width >= 6) {
      structural += 1
      continue
    }
    if (profile.width >= 1 && profile.width <= 3) thin += 1
  }
  return thin >= 3 && structural === 0
}

function perpProfile(
  x: number,
  y: number,
  px: number,
  py: number,
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): { width: number; runs: number } {
  let runs = 0
  let inRun = false
  let runStart = 0
  let centerWidth = 0
  for (let d = -radius; d <= radius; d++) {
    const xx = Math.round(x + px * d)
    const yy = Math.round(y + py * d)
    const hit = xx >= 0 && yy >= 0 && xx < width && yy < height && mask[yy * width + xx] === 1
    if (hit && !inRun) {
      inRun = true
      runStart = d
      runs += 1
    } else if (!hit && inRun) {
      inRun = false
      if (runStart <= 0 && d >= 0) centerWidth = d - runStart
    }
  }
  if (inRun && runStart <= 0) centerWidth = radius - runStart + 1
  return { width: centerWidth, runs }
}

function dilatedInkMask(image: TraceImageData, radius: number): Uint8Array {
  const mask = inkMask(image)
  const { width, height } = image
  const total = width * height
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
