import { traceBBox } from './build-floorplan'
import type { PixelSegment, WallTrace } from './types'

export interface AiWallsPayload {
  imageWidth: number
  imageHeight: number
  outerLoop: Array<{ x: number; y: number }>
  innerWalls?: Array<{ x1: number; y1: number; x2: number; y2: number }>
}

export class AiWallsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiWallsValidationError'
  }
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fence?.[1] ?? trimmed).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new AiWallsValidationError('模型没有返回 JSON 对象')
  }
  return JSON.parse(raw.slice(start, end + 1))
}

export function parseAiWallsPayload(raw: unknown): AiWallsPayload {
  if (!raw || typeof raw !== 'object') {
    throw new AiWallsValidationError('认墙结果不是对象')
  }
  const data = raw as Record<string, unknown>
  const imageWidth = asPositiveNumber(data.imageWidth, 'imageWidth')
  const imageHeight = asPositiveNumber(data.imageHeight, 'imageHeight')
  const loopRaw = data.outerLoop
  if (!Array.isArray(loopRaw) || loopRaw.length < 4) {
    throw new AiWallsValidationError('缺少闭合外墙 outerLoop（至少 4 个点）')
  }
  if (loopRaw.length > 48) {
    throw new AiWallsValidationError('外墙折点过多')
  }
  const outerLoop = loopRaw.map((p, i) => asPoint(p, `outerLoop[${i}]`))
  const innerRaw = data.innerWalls
  if (innerRaw != null && !Array.isArray(innerRaw)) {
    throw new AiWallsValidationError('innerWalls 必须是数组')
  }
  if (innerRaw && innerRaw.length > 80) {
    throw new AiWallsValidationError('内墙数量过多')
  }
  const innerWalls = (innerRaw ?? []).map((s, i) => asSegment(s, `innerWalls[${i}]`))
  return { imageWidth, imageHeight, outerLoop, innerWalls }
}

export interface FloorplanFindings {
  overallWidthMm?: number
  rooms: string[]
  furniture: string[]
}

export function extractFloorplanFindings(text: string): FloorplanFindings | null {
  if (!text.includes('findings') && !text.includes('rooms') && !text.includes('furniture')) {
    return null
  }
  const rooms = uniqueNames([
    ...matchQuotedNames(sliceSection(text, 'rooms', 'furniture')),
    ...matchNamedObjects(sliceSection(text, 'rooms', 'furniture'))
  ])
  const furniture = uniqueNames([
    ...matchQuotedNames(sliceSection(text, 'furniture')),
    ...matchNamedObjects(sliceSection(text, 'furniture'))
  ])
  const overallWidthMm = pickNumber(text, 'overallWidthMm')
  if (!rooms.length && !furniture.length && !overallWidthMm) {
    return null
  }
  return { overallWidthMm, rooms, furniture }
}

export function formatFindingsZh(findings: FloorplanFindings): string {
  const lines: string[] = []
  if (findings.overallWidthMm) {
    lines.push(`总宽 ${findings.overallWidthMm} mm`)
  }
  if (findings.rooms.length) {
    lines.push(`房间：${findings.rooms.join('、')}`)
  }
  if (findings.furniture.length) {
    lines.push(`家具：${findings.furniture.join('、')}`)
  }
  return lines.join('\n')
}

function matchQuotedNames(text: string): string[] {
  return [...text.matchAll(/"name"\s*:\s*"([^"]+)"/g)].map((m) => m[1]).filter(Boolean)
}

function matchNamedObjects(text: string): string[] {
  return [...text.matchAll(/"kind"\s*:\s*"([^"]+)"/g)].map((m) => m[1]).filter(Boolean)
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

export interface PartialAiWalls extends AiWallsPayload {
  closeLoop: boolean
  complete: boolean
}

const POINT_RE = /\{\s*"x"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"y"\s*:\s*(-?\d+(?:\.\d+)?)\s*\}/g
const SEG_RE =
  /\{\s*"x1"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"y1"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"x2"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"y2"\s*:\s*(-?\d+(?:\.\d+)?)\s*\}/g

function pickNumber(text: string, key: string): number | undefined {
  const match = text.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`))
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function sliceSection(text: string, key: string, nextKey?: string): string {
  return extractBracketArray(text, key) || sliceUntilNextKey(text, key, nextKey)
}

function sliceUntilNextKey(text: string, key: string, nextKey?: string): string {
  const start = text.indexOf(`"${key}"`)
  if (start < 0) return ''
  const from = text.indexOf('[', start)
  if (from < 0) return ''
  if (!nextKey) return text.slice(from)
  const next = text.indexOf(`"${nextKey}"`, from)
  return next < 0 ? text.slice(from) : text.slice(from, next)
}

function extractBracketArray(text: string, key: string): string {
  const start = text.indexOf(`"${key}"`)
  if (start < 0) return ''
  const from = text.indexOf('[', start)
  if (from < 0) return ''
  let depth = 0
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return text.slice(from, i + 1)
    }
  }
  return text.slice(from)
}

export function extractPartialAiWalls(text: string): PartialAiWalls | null {
  try {
    const payload = parseAiWallsPayload(extractJsonObject(text))
    return { ...payload, innerWalls: payload.innerWalls ?? [], closeLoop: true, complete: true }
  } catch {
    // Keep scanning a truncated stream.
  }
  if (!text.includes('outerLoop') && !text.includes('innerWalls')) {
    return null
  }
  const outerLoop = [...sliceSection(text, 'outerLoop', 'innerWalls').matchAll(POINT_RE)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2])
  }))
  const innerWalls = [...sliceSection(text, 'innerWalls').matchAll(SEG_RE)].map((m) => ({
    x1: Number(m[1]),
    y1: Number(m[2]),
    x2: Number(m[3]),
    y2: Number(m[4])
  }))
  if (outerLoop.length < 2) {
    return null
  }
  const imageWidth = pickNumber(text, 'imageWidth') ?? 1
  const imageHeight = pickNumber(text, 'imageHeight') ?? 1
  const closeLoop = /"outerLoop"\s*:\s*\[[\s\S]*?\]/.test(text) && outerLoop.length >= 3
  return { imageWidth, imageHeight, outerLoop, innerWalls, closeLoop, complete: false }
}

export function aiWallsToTracePartial(
  payload: Pick<AiWallsPayload, 'imageWidth' | 'imageHeight' | 'outerLoop' | 'innerWalls'>,
  destWidth: number,
  destHeight: number,
  closeLoop = true
): WallTrace | null {
  const imageWidth = payload.imageWidth > 1 ? payload.imageWidth : destWidth
  const imageHeight = payload.imageHeight > 1 ? payload.imageHeight : destHeight
  const sx = destWidth / imageWidth
  const sy = destHeight / imageHeight
  const normalized = looksNormalized({
    imageWidth,
    imageHeight,
    outerLoop: payload.outerLoop,
    innerWalls: payload.innerWalls
  })
  const mapX = (x: number) => (normalized ? x * destWidth : x * sx)
  const mapY = (y: number) => (normalized ? y * destHeight : y * sy)
  const loop = payload.outerLoop.map((p) => ({ x: mapX(p.x), y: mapY(p.y) }))
  const segments: PixelSegment[] = []
  const last = closeLoop && loop.length >= 3 ? loop.length : Math.max(0, loop.length - 1)
  for (let i = 0; i < last; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    const seg = snapManhattan({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    if (segmentLen(seg) >= 2) {
      segments.push(seg)
    }
  }
  const outerCount = segments.length
  for (const wall of payload.innerWalls ?? []) {
    const seg = snapManhattan({
      x1: mapX(wall.x1),
      y1: mapY(wall.y1),
      x2: mapX(wall.x2),
      y2: mapY(wall.y2)
    })
    if (segmentLen(seg) >= 2) {
      segments.push(seg)
    }
  }
  if (segments.length === 0) {
    return null
  }
  return {
    segments,
    bbox: traceBBox(segments),
    imageWidth: destWidth,
    imageHeight: destHeight,
    outerCount
  }
}

export function aiWallsToTrace(
  payload: AiWallsPayload,
  destWidth: number,
  destHeight: number
): WallTrace {
  const sx = destWidth / payload.imageWidth
  const sy = destHeight / payload.imageHeight
  const normalized = looksNormalized(payload)
  const mapX = (x: number) => (normalized ? x * destWidth : x * sx)
  const mapY = (y: number) => (normalized ? y * destHeight : y * sy)

  const loop = payload.outerLoop.map((p) => ({ x: mapX(p.x), y: mapY(p.y) }))
  const segments: PixelSegment[] = []
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    const seg = snapManhattan({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    if (segmentLen(seg) >= 2) {
      segments.push(seg)
    }
  }
  const outerCount = segments.length
  if (outerCount < 4) {
    throw new AiWallsValidationError('外墙无法闭合成至少 4 段')
  }
  for (const wall of payload.innerWalls ?? []) {
    const seg = snapManhattan({
      x1: mapX(wall.x1),
      y1: mapY(wall.y1),
      x2: mapX(wall.x2),
      y2: mapY(wall.y2)
    })
    if (segmentLen(seg) >= 2) {
      segments.push(seg)
    }
  }
  return {
    segments,
    bbox: traceBBox(segments),
    imageWidth: destWidth,
    imageHeight: destHeight,
    outerCount
  }
}

function asPositiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new AiWallsValidationError(`${label} 无效`)
  }
  return value
}

function asPoint(value: unknown, label: string): { x: number; y: number } {
  if (!value || typeof value !== 'object') {
    throw new AiWallsValidationError(`${label} 不是点`)
  }
  const p = value as Record<string, unknown>
  if (typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    throw new AiWallsValidationError(`${label} 坐标无效`)
  }
  return { x: p.x, y: p.y }
}

function asSegment(value: unknown, label: string): { x1: number; y1: number; x2: number; y2: number } {
  if (!value || typeof value !== 'object') {
    throw new AiWallsValidationError(`${label} 不是线段`)
  }
  const s = value as Record<string, unknown>
  for (const key of ['x1', 'y1', 'x2', 'y2'] as const) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key])) {
      throw new AiWallsValidationError(`${label}.${key} 无效`)
    }
  }
  return { x1: s.x1 as number, y1: s.y1 as number, x2: s.x2 as number, y2: s.y2 as number }
}

function looksNormalized(payload: AiWallsPayload): boolean {
  const coords: number[] = []
  for (const p of payload.outerLoop) {
    coords.push(p.x, p.y)
  }
  for (const s of payload.innerWalls ?? []) {
    coords.push(s.x1, s.y1, s.x2, s.y2)
  }
  return coords.length > 0 && coords.every((v) => v >= -0.05 && v <= 1.5)
}

function snapManhattan(s: PixelSegment): PixelSegment {
  if (Math.abs(s.x2 - s.x1) >= Math.abs(s.y2 - s.y1)) {
    const y = (s.y1 + s.y2) / 2
    return { x1: s.x1, y1: y, x2: s.x2, y2: y }
  }
  const x = (s.x1 + s.x2) / 2
  return { x1: x, y1: s.y1, x2: x, y2: s.y2 }
}

function segmentLen(s: PixelSegment): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
}
