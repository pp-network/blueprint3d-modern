import { segmentLength, traceBBox } from './build-floorplan'
import type { PixelSegment, WallTrace } from './types'

export interface TraceImageData {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

interface Run {
  a0: number
  a1: number
  t: number
}

/** Rasterize an image for tracing. Coordinates map back with `x / scale`. */
export function rasterizeImage(
  image: HTMLImageElement,
  maxWidth = 1600
): { imageData: ImageData; scale: number } {
  const srcW = image.naturalWidth || image.width
  const srcH = image.naturalHeight || image.height
  const scale = Math.min(1, maxWidth / Math.max(1, srcW))
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('canvas 2d context unavailable')
  }
  ctx.drawImage(image, 0, 0, width, height)
  return { imageData: ctx.getImageData(0, 0, width, height), scale }
}

export function traceWallsFromImage(image: HTMLImageElement): WallTrace {
  const { imageData, scale } = rasterizeImage(image)
  const scaled = traceWallsFromImageData(imageData)
  const inv = scale > 0 ? 1 / scale : 1
  const segments = scaled.segments.map((s) => ({
    x1: s.x1 * inv,
    y1: s.y1 * inv,
    x2: s.x2 * inv,
    y2: s.y2 * inv
  }))
  return {
    segments,
    bbox: traceBBox(segments),
    imageWidth: image.naturalWidth || image.width,
    imageHeight: image.naturalHeight || image.height
  }
}

export function traceWallsFromImageData(
  image: TraceImageData,
  options?: { openRadius?: number }
): WallTrace {
  const { width, height } = image
  const minDim = Math.min(width, height)
  const radius =
    options?.openRadius ?? (minDim >= 1600 ? 2 : minDim >= 240 ? 1 : 0)
  const mask = inkMask(image)
  if (radius > 0) {
    openMask(mask, width, height, radius)
  }
  // Must exceed typical wall *thickness* so vertical walls are not
  // sliced into many short horizontal runs (and vice versa).
  const minRun = Math.max(12, Math.round(minDim * 0.03))
  const horiz = clusterRuns(collectRuns(mask, width, height, true, minRun), 8, minRun, true)
  const vert = clusterRuns(collectRuns(mask, width, height, false, minRun), 8, minRun, false)
  const quant = Math.max(2, Math.round(minDim * 0.0035))
  let segments = [...horiz, ...vert].map((s) => quantizeSegment(s, quant))
  segments = mergeCollinear(segments, quant * 2)
  segments = keepConnected(segments, Math.max(10, quant * 3))
  segments = segments.filter((s) => segmentLength(s) >= minRun * 0.7)
  if (segments.length < 3 && radius > 0) {
    return traceWallsFromImageData(image, { openRadius: radius - 1 })
  }
  return {
    segments,
    bbox: traceBBox(segments),
    imageWidth: width,
    imageHeight: height
  }
}

function inkMask(image: TraceImageData): Uint8Array {
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
  const threshold = otsu(gray)
  const mask = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    const cut = invert ? Math.min(threshold, 220) : Math.max(threshold, 16)
    const ink = invert ? gray[i] >= cut : gray[i] <= cut
    mask[i] = ink ? 1 : 0
  }
  return mask
}

function otsu(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < gray.length; i++) {
    hist[gray[i]]++
  }
  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) {
    sum += i * hist[i]
  }
  let sumB = 0
  let wB = 0
  let max = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) {
      continue
    }
    const wF = total - wB
    if (wF === 0) {
      break
    }
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between >= max) {
      max = between
      threshold = t
    }
  }
  return threshold
}

function openMask(mask: Uint8Array, w: number, h: number, radius: number): void {
  const eroded = morph(mask, w, h, radius, false)
  const opened = morph(eroded, w, h, radius, true)
  mask.set(opened)
}

function morph(src: Uint8Array, w: number, h: number, radius: number, dilate: boolean): Uint8Array {
  const out = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let keep = dilate ? 0 : 1
      outer: for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) {
          continue
        }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) {
            continue
          }
          const v = src[yy * w + xx]
          if (dilate) {
            if (v) {
              keep = 1
              break outer
            }
          } else if (!v) {
            keep = 0
            break outer
          }
        }
      }
      out[y * w + x] = keep
    }
  }
  return out
}

function collectRuns(
  mask: Uint8Array,
  w: number,
  h: number,
  horizontal: boolean,
  minRun: number
): Run[] {
  const runs: Run[] = []
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      let x = 0
      while (x < w) {
        while (x < w && !mask[y * w + x]) x++
        const x0 = x
        while (x < w && mask[y * w + x]) x++
        if (x - x0 >= minRun) {
          runs.push({ a0: x0, a1: x - 1, t: y })
        }
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let y = 0
      while (y < h) {
        while (y < h && !mask[y * w + x]) y++
        const y0 = y
        while (y < h && mask[y * w + x]) y++
        if (y - y0 >= minRun) {
          runs.push({ a0: y0, a1: y - 1, t: x })
        }
      }
    }
  }
  return runs
}

function clusterRuns(
  runs: Run[],
  maxDt: number,
  minLength: number,
  horizontal: boolean
): PixelSegment[] {
  if (runs.length === 0) {
    return []
  }
  const unused = runs
    .slice()
    .sort((a, b) => (a.t === b.t ? a.a0 - b.a0 : a.t - b.t))
  const used = new Array(unused.length).fill(false)
  const segments: PixelSegment[] = []

  for (let i = 0; i < unused.length; i++) {
    if (used[i]) {
      continue
    }
    let a0 = unused[i].a0
    let a1 = unused[i].a1
    let tSum = unused[i].t
    let n = 1
    used[i] = true
    for (let j = i + 1; j < unused.length; j++) {
      if (used[j]) {
        continue
      }
      const r = unused[j]
      const tMean = tSum / n
      if (Math.abs(r.t - tMean) > maxDt) {
        if (r.t - tMean > maxDt) {
          break
        }
        continue
      }
      const overlap = Math.min(a1, r.a1) - Math.max(a0, r.a0)
      const span = Math.min(a1 - a0, r.a1 - r.a0) + 1
      if (overlap < span * 0.35 && overlap < 8) {
        continue
      }
      used[j] = true
      a0 = Math.min(a0, r.a0)
      a1 = Math.max(a1, r.a1)
      tSum += r.t
      n++
    }
    if (a1 - a0 + 1 < minLength) {
      continue
    }
    const t = tSum / n
    segments.push(
      horizontal
        ? { x1: a0, y1: t, x2: a1, y2: t }
        : { x1: t, y1: a0, x2: t, y2: a1 }
    )
  }
  return segments
}

function quantizeSegment(s: PixelSegment, step: number): PixelSegment {
  const q = (v: number) => Math.round(v / step) * step
  const horizontal = Math.abs(s.y2 - s.y1) <= Math.abs(s.x2 - s.x1)
  if (horizontal) {
    const y = q((s.y1 + s.y2) / 2)
    return { x1: q(Math.min(s.x1, s.x2)), y1: y, x2: q(Math.max(s.x1, s.x2)), y2: y }
  }
  const x = q((s.x1 + s.x2) / 2)
  return { x1: x, y1: q(Math.min(s.y1, s.y2)), x2: x, y2: q(Math.max(s.y1, s.y2)) }
}

function mergeCollinear(segments: PixelSegment[], gap: number): PixelSegment[] {
  const out: PixelSegment[] = []
  const used = new Array(segments.length).fill(false)
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) {
      continue
    }
    let cur = { ...segments[i] }
    used[i] = true
    let changed = true
    while (changed) {
      changed = false
      for (let j = 0; j < segments.length; j++) {
        if (used[j]) {
          continue
        }
        const merged = tryMerge(cur, segments[j], gap)
        if (merged) {
          cur = merged
          used[j] = true
          changed = true
        }
      }
    }
    out.push(cur)
  }
  return out
}

function tryMerge(a: PixelSegment, b: PixelSegment, gap: number): PixelSegment | null {
  const aH = Math.abs(a.y2 - a.y1) <= 1e-6
  const bH = Math.abs(b.y2 - b.y1) <= 1e-6
  if (aH !== bH) {
    return null
  }
  if (aH) {
    if (Math.abs(a.y1 - b.y1) > gap) {
      return null
    }
    const a0 = Math.min(a.x1, a.x2)
    const a1 = Math.max(a.x1, a.x2)
    const b0 = Math.min(b.x1, b.x2)
    const b1 = Math.max(b.x1, b.x2)
    if (b0 > a1 + gap || a0 > b1 + gap) {
      return null
    }
    const y = (a.y1 + b.y1) / 2
    return { x1: Math.min(a0, b0), y1: y, x2: Math.max(a1, b1), y2: y }
  }
  if (Math.abs(a.x1 - b.x1) > gap) {
    return null
  }
  const a0 = Math.min(a.y1, a.y2)
  const a1 = Math.max(a.y1, a.y2)
  const b0 = Math.min(b.y1, b.y2)
  const b1 = Math.max(b.y1, b.y2)
  if (b0 > a1 + gap || a0 > b1 + gap) {
    return null
  }
  const x = (a.x1 + b.x1) / 2
  return { x1: x, y1: Math.min(a0, b0), x2: x, y2: Math.max(a1, b1) }
}

function keepConnected(segments: PixelSegment[], snap: number): PixelSegment[] {
  if (segments.length === 0) {
    return []
  }
  const n = segments.length
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (touches(segments[i], segments[j], snap)) {
        adj[i].push(j)
        adj[j].push(i)
      }
    }
  }
  const seen = new Array(n).fill(false)
  let best: number[] = []
  let bestLen = 0
  for (let i = 0; i < n; i++) {
    if (seen[i]) {
      continue
    }
    const stack = [i]
    const comp: number[] = []
    seen[i] = true
    let len = 0
    while (stack.length) {
      const v = stack.pop()!
      comp.push(v)
      len += segmentLength(segments[v])
      for (const u of adj[v]) {
        if (!seen[u]) {
          seen[u] = true
          stack.push(u)
        }
      }
    }
    if (len > bestLen) {
      bestLen = len
      best = comp
    }
  }
  const keep = new Set(best)
  // keep secondary components that are at least 25% of the main graph
  seen.fill(false)
  for (let i = 0; i < n; i++) {
    if (seen[i] || keep.has(i)) {
      continue
    }
    const stack = [i]
    const comp: number[] = []
    seen[i] = true
    let len = 0
    while (stack.length) {
      const v = stack.pop()!
      comp.push(v)
      len += segmentLength(segments[v])
      for (const u of adj[v]) {
        if (!seen[u]) {
          seen[u] = true
          stack.push(u)
        }
      }
    }
    if (len >= bestLen * 0.25) {
      for (const v of comp) {
        keep.add(v)
      }
    }
  }
  return segments.filter((_, i) => keep.has(i))
}

function touches(a: PixelSegment, b: PixelSegment, snap: number): boolean {
  const ptsA = [
    { x: a.x1, y: a.y1 },
    { x: a.x2, y: a.y2 }
  ]
  const ptsB = [
    { x: b.x1, y: b.y1 },
    { x: b.x2, y: b.y2 }
  ]
  for (const p of ptsA) {
    if (distToSeg(p, b) <= snap) {
      return true
    }
  }
  for (const p of ptsB) {
    if (distToSeg(p, a) <= snap) {
      return true
    }
  }
  return false
}

function distToSeg(p: { x: number; y: number }, s: PixelSegment): number {
  const vx = s.x2 - s.x1
  const vy = s.y2 - s.y1
  const len2 = vx * vx + vy * vy
  if (len2 < 1e-6) {
    return Math.hypot(p.x - s.x1, p.y - s.y1)
  }
  let t = ((p.x - s.x1) * vx + (p.y - s.y1) * vy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (s.x1 + t * vx), p.y - (s.y1 + t * vy))
}
