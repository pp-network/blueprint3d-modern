import type { TraceImageData } from './trace-walls'

/**
 * CAD ink prior (design/floorplan-ai-oss.md):
 * yellow dimension / text is not wall ink; mid-gray fills on dark sheets are bearing.
 */
export function isYellowAnnotation(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max < 80) return false
  const sat = (max - min) / max
  return r >= 140 && g >= 110 && b < r * 0.72 && b < g * 0.85 && sat > 0.22
}

export function cadInkMask(image: TraceImageData): Uint8Array {
  const { data, width, height } = image
  const total = width * height
  const gray = new Uint8Array(total)
  const yellow = new Uint8Array(total)
  let sum = 0
  let counted = 0
  for (let i = 0; i < total; i++) {
    const o = i * 4
    const r = data[o]
    const g = data[o + 1]
    const b = data[o + 2]
    if (isYellowAnnotation(r, g, b)) {
      yellow[i] = 1
      continue
    }
    const v = 0.299 * r + 0.587 * g + 0.114 * b
    gray[i] = v
    sum += v
    counted += 1
  }
  const mean = counted > 0 ? sum / counted : 128
  const invert = mean < 128
  const threshold = otsu(gray, yellow)
  const cut = invert ? Math.max(55, Math.min(threshold, 150)) : Math.max(threshold, 16)
  const mask = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    if (yellow[i]) continue
    const ink = invert ? gray[i] >= cut : gray[i] <= cut
    mask[i] = ink ? 1 : 0
  }
  return mask
}

function otsu(gray: Uint8Array, skip?: Uint8Array): number {
  const hist = new Array<number>(256).fill(0)
  let total = 0
  for (let i = 0; i < gray.length; i++) {
    if (skip?.[i]) continue
    hist[gray[i]]++
    total += 1
  }
  if (total === 0) return 128
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
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > max) {
      max = between
      threshold = t
    }
  }
  return threshold
}
