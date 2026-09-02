import { traceBBox } from './build-floorplan'
import type { PixelSegment, WallTrace } from './types'

export interface AiWallsPayload {
  imageWidth: number
  imageHeight: number
  outerLoop: Array<{ x: number; y: number }>
  innerWalls?: Array<{ x1: number; y1: number; x2: number; y2: number }>
  findings?: unknown
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
  const outerLoop = dropClosedDuplicate(loopRaw.map((p, i) => asPoint(p, `outerLoop[${i}]`)))
  const innerRaw = data.innerWalls
  if (innerRaw != null && !Array.isArray(innerRaw)) {
    throw new AiWallsValidationError('innerWalls 必须是数组')
  }
  if (innerRaw && innerRaw.length > 80) {
    throw new AiWallsValidationError('内墙数量过多')
  }
  const innerWalls = (innerRaw ?? []).map((s, i) => asSegment(s, `innerWalls[${i}]`))
  return clampPayloadToImage({
    imageWidth,
    imageHeight,
    outerLoop,
    innerWalls,
    findings: data.findings
  })
}

export function alignPayloadToImage(
  payload: AiWallsPayload,
  width?: number,
  height?: number
): AiWallsPayload {
  if (!width || !height || width <= 0 || height <= 0) {
    return payload
  }
  const sx = width / payload.imageWidth
  const sy = height / payload.imageHeight
  if (Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) {
    return { ...payload, imageWidth: width, imageHeight: height }
  }
  return clampPayloadToImage({
    imageWidth: width,
    imageHeight: height,
    outerLoop: payload.outerLoop.map((p) => ({ x: p.x * sx, y: p.y * sy })),
    innerWalls: (payload.innerWalls ?? []).map((s) => ({
      x1: s.x1 * sx,
      y1: s.y1 * sy,
      x2: s.x2 * sx,
      y2: s.y2 * sy
    })),
    findings: payload.findings
  })
}

export function clampPayloadToImage(payload: AiWallsPayload): AiWallsPayload {
  const w = payload.imageWidth
  const h = payload.imageHeight
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value))
  const outerLoop = payload.outerLoop.map((p) => ({ x: clamp(p.x, w), y: clamp(p.y, h) }))
  const innerWalls = (payload.innerWalls ?? [])
    .map((s) => ({
      x1: clamp(s.x1, w),
      y1: clamp(s.y1, h),
      x2: clamp(s.x2, w),
      y2: clamp(s.y2, h)
    }))
    .filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= 2)
  return { ...payload, outerLoop, innerWalls }
}

export function critiqueAiWalls(
  payload: AiWallsPayload,
  roomCount = 0,
  doorCount = 0
): string[] {
  const notes: string[] = []
  const oob = payload.outerLoop.some(
    (p) => p.x < 0 || p.y < 0 || p.x > payload.imageWidth || p.y > payload.imageHeight
  )
  if (oob) {
    notes.push('外墙有点画出图外，已拉回图像范围')
  }
  const inner = payload.innerWalls?.length ?? 0
  if (roomCount >= 6 && inner < roomCount + 3) {
    notes.push('隔墙偏少，厨房/卫生间/卧室可能还没分开，请在 2D 补墙')
  }
  if (roomCount >= 6 && doorCount < Math.floor(roomCount / 2)) {
    notes.push('门洞偏少，各房间入口可能没写全')
  }
  const xs = payload.outerLoop.map((p) => p.x)
  const west = Math.min(...xs)
  const westJogs = new Set(
    payload.outerLoop.filter((p) => Math.abs(p.x - west) <= payload.imageWidth * 0.03).map((p) => Math.round(p.y / 20))
  )
  if (westJogs.size <= 2) {
    notes.push('左侧外墙几乎是一条竖线，次卫凸出和入口退线可能漏了')
  }
  if (payload.outerLoop.length <= 6) {
    notes.push('外墙只有示意轮廓，阳台凹凸和房间拐角可能被简化掉了')
  }
  return notes
}

export interface FloorplanFindings {
  overallWidthMm?: number
  rooms: string[]
  furniture: string[]
}

export type CatalogKind =
  | 'bed'
  | 'drawer'
  | 'wardrobe'
  | 'light'
  | 'storage'
  | 'table'
  | 'chair'
  | 'sofa'
  | 'armchair'
  | 'stool'
  | 'door'
  | 'window'

export interface DetectedPoint {
  name: string
  kind?: string
  x: number
  y: number
}

export interface FloorplanPlacements {
  overallWidthMm?: number
  rooms: DetectedPoint[]
  furniture: DetectedPoint[]
  openings: DetectedPoint[]
}

export function extractFloorplanFindings(text: string): FloorplanFindings | null {
  if (!text.includes('findings') && !text.includes('rooms') && !text.includes('furniture')) {
    return null
  }
  const rooms = uniqueNames([
    ...matchQuotedNames(sliceSection(text, 'rooms', 'furniture')),
    ...matchNamedObjects(sliceSection(text, 'rooms', 'furniture'))
  ])
  const furnitureNames = uniqueNames(matchQuotedNames(sliceSection(text, 'furniture')))
  const furniture = furnitureNames.length
    ? furnitureNames
    : uniqueNames(matchNamedObjects(sliceSection(text, 'furniture')))
  const overallWidthMm = pickNumber(text, 'overallWidthMm')
  if (!rooms.length && !furniture.length && !overallWidthMm) {
    return null
  }
  return { overallWidthMm, rooms, furniture }
}

export function formatFindingsZh(findings: FloorplanFindings, notes: string[] = []): string {
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
  if (notes.length) {
    lines.push(`核对：${notes.join('；')}`)
  }
  return lines.join('\n')
}

export function extractFloorplanPlacements(text: string): FloorplanPlacements | null {
  const roomsRaw = extractBracketArray(text, 'rooms') || sliceUntilNextKey(text, 'rooms', 'furniture')
  const furnitureRaw = extractBracketArray(text, 'furniture') || sliceUntilNextKey(text, 'furniture', 'openings')
  const openingsRaw = extractBracketArray(text, 'openings') || sliceUntilNextKey(text, 'openings')
  const rooms = parseNamedPoints(roomsRaw)
  const furniture = parseNamedPoints(furnitureRaw)
  const openings = parseNamedPoints(openingsRaw)
  const fromFurniture = furniture.filter((item) => item.kind === 'door' || item.kind === 'window')
  const mergedOpenings = [...openings]
  for (const item of fromFurniture) {
    const duplicate = mergedOpenings.some(
      (o) => o.kind === item.kind && Math.hypot(o.x - item.x, o.y - item.y) < 4
    )
    if (!duplicate) {
      mergedOpenings.push(item)
    }
  }
  const overallWidthMm = pickNumber(text, 'overallWidthMm')
  if (!rooms.length && !furniture.length && !mergedOpenings.length && !overallWidthMm) {
    return null
  }
  return {
    overallWidthMm,
    rooms,
    furniture: furniture.filter((item) => item.kind !== 'door' && item.kind !== 'window'),
    openings: mergedOpenings
  }
}

function parseNamedPoints(text: string): DetectedPoint[] {
  const points: DetectedPoint[] = []
  const objectRe = /\{[^{}]*\}/g
  for (const raw of text.match(objectRe) ?? []) {
    const name = raw.match(/"name"\s*:\s*"([^"]+)"/)?.[1]?.trim()
    const kind = raw.match(/"kind"\s*:\s*"([^"]+)"/)?.[1]?.trim()
    const x = Number(raw.match(/"x"\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1])
    const y = Number(raw.match(/"y"\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    points.push({
      name: name || kind || '',
      kind,
      x,
      y
    })
  }
  return points
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

export function critiqueFromOutput(text: string, placements?: FloorplanPlacements | null): string[] {
  const imageWidth = pickNumber(text, 'imageWidth')
  const imageHeight = pickNumber(text, 'imageHeight')
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
  if (!imageWidth || !imageHeight || outerLoop.length < 4) {
    return []
  }
  const rooms = placements?.rooms.length ?? 0
  const doors = placements?.openings.filter((o) => o.kind === 'door').length ?? 0
  return critiqueAiWalls({ imageWidth, imageHeight, outerLoop, innerWalls }, rooms, doors)
}

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

function dropClosedDuplicate(loop: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (loop.length < 2) return loop
  const first = loop[0]
  const last = loop[loop.length - 1]
  if (Math.hypot(first.x - last.x, first.y - last.y) < 1) {
    return loop.slice(0, -1)
  }
  return loop
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
