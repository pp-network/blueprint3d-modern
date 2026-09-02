import { catalogKindFromLabel } from './catalog-pick'
import type { DetectedPoint, FloorplanFindings, FloorplanPlacements } from './ai-walls-schema'
import { extractFloorplanFindings, extractFloorplanPlacements } from './ai-walls-schema'

const COORD_RE = /\((\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\)/g

const ROOM_ZH = [
  '衣帽间',
  '卫生间',
  '主卧',
  '次卧',
  '主卫',
  '次卫',
  '公卫',
  '厨房',
  '餐厅',
  '客厅',
  '阳台',
  '书房',
  '玄关'
]

const ROOM_EN: Array<{ re: RegExp; name: string }> = [
  { re: /master bathroom|master bath/i, name: '主卫' },
  { re: /secondary bathroom|public bathroom/i, name: '次卫' },
  { re: /master bedroom/i, name: '主卧' },
  { re: /secondary bedroom/i, name: '次卧' },
  { re: /living room|living area/i, name: '客厅' },
  { re: /dining area|dining room/i, name: '餐厅' },
  { re: /\bkitchen\b/i, name: '厨房' },
  { re: /\bbalcony\b/i, name: '阳台' }
]

const WALL_CONTEXT =
  /(?:northwest|southwest|southeast|northeast) corner|outer loop|outer perimeter|wall segments?|wall alignment|building's footprint|vicinity of|x=\d+\s+to\s+x=\d+/i

export function extractThinkingPlacements(text: string): FloorplanPlacements | null {
  if (!text.trim()) return null
  const rooms: DetectedPoint[] = []
  const furniture: DetectedPoint[] = []
  const openings: DetectedPoint[] = []

  for (const match of text.matchAll(COORD_RE)) {
    const x = Number(match[1])
    const y = Number(match[2])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const start = match.index ?? 0
    const classified = classifyThinkingCoord(text, start)
    if (!classified) continue
    const point: DetectedPoint = { name: classified.name, kind: classified.kind, x, y }
    if (classified.bucket === 'room') addPoint(rooms, point, 64)
    else if (classified.bucket === 'opening') addPoint(openings, point, 36)
    else addPoint(furniture, point, 36)
  }

  const overallWidthMm = pickWidthMm(text)
  if (!rooms.length && !furniture.length && !openings.length && !overallWidthMm) {
    return null
  }
  return { overallWidthMm, rooms, furniture, openings }
}

export function extractThinkingFindings(text: string): FloorplanFindings | null {
  const placed = extractThinkingPlacements(text)
  const rooms = uniqueNames([
    ...(placed?.rooms.map((r) => r.name) ?? []),
    ...ROOM_ZH.filter((name) => text.includes(name)),
    ...ROOM_EN.filter((item) => item.re.test(text)).map((item) => item.name)
  ])
  const furniture = uniqueNames(placed?.furniture.map((f) => f.name) ?? [])
  const overallWidthMm = placed?.overallWidthMm ?? pickWidthMm(text)
  if (!rooms.length && !furniture.length && !overallWidthMm) return null
  return { overallWidthMm, rooms, furniture }
}

export function collectFloorplanPlacements(input: {
  output?: string
  thinking?: string
  payloadJson?: string
}): FloorplanPlacements | null {
  const fromJson =
    (input.payloadJson ? extractFloorplanPlacements(input.payloadJson) : null) ??
    (input.output ? extractFloorplanPlacements(input.output) : null)
  const fromThink = extractThinkingPlacements(input.thinking ?? '')
  return mergePlacements(fromJson, fromThink)
}

export function collectFloorplanFindings(input: {
  output?: string
  thinking?: string
  payloadJson?: string
}): FloorplanFindings | null {
  const fromJson =
    (input.payloadJson ? extractFloorplanFindings(input.payloadJson) : null) ??
    (input.output ? extractFloorplanFindings(input.output) : null)
  const fromThink = extractThinkingFindings(input.thinking ?? '')
  if (!fromJson && !fromThink) return null
  return {
    overallWidthMm: fromJson?.overallWidthMm ?? fromThink?.overallWidthMm,
    rooms: uniqueNames([...(fromJson?.rooms ?? []), ...(fromThink?.rooms ?? [])]),
    furniture: uniqueNames([...(fromJson?.furniture ?? []), ...(fromThink?.furniture ?? [])])
  }
}

export function mergePlacements(
  primary: FloorplanPlacements | null,
  fallback: FloorplanPlacements | null
): FloorplanPlacements | null {
  if (!primary && !fallback) return null
  const rooms = [...(primary?.rooms ?? [])]
  const furniture = [...(primary?.furniture ?? [])]
  const openings = [...(primary?.openings ?? [])]
  for (const room of fallback?.rooms ?? []) addPoint(rooms, room, 64)
  for (const item of fallback?.furniture ?? []) addPoint(furniture, item, 36)
  for (const opening of fallback?.openings ?? []) addPoint(openings, opening, 36)
  const overallWidthMm = primary?.overallWidthMm ?? fallback?.overallWidthMm
  if (!rooms.length && !furniture.length && !openings.length && !overallWidthMm) return null
  return { overallWidthMm, rooms, furniture, openings }
}

function clauseBefore(text: string, coordIndex: number): string {
  const window = text.slice(Math.max(0, coordIndex - 160), coordIndex)
  const parts = window.split(/(?:\n|\*\*|[.。;；])/)
  return (parts[parts.length - 1] ?? window).trim()
}

function classifyThinkingCoord(
  text: string,
  coordIndex: number
): { bucket: 'room' | 'opening' | 'furniture'; name: string; kind?: string } | null {
  const clause = clauseBefore(text, coordIndex)
  const after = text.slice(coordIndex, Math.min(text.length, coordIndex + 12))
  if (WALL_CONTEXT.test(`${clause} ${after}`)) return null
  return nearestLabel(clause)
}

function nearestLabel(
  clause: string
): { bucket: 'room' | 'opening' | 'furniture'; name: string; kind?: string } | null {
  const hits: Array<{ at: number; bucket: 'room' | 'opening' | 'furniture'; name: string; kind?: string }> =
    []
  for (const name of ROOM_ZH) {
    const at = clause.lastIndexOf(name)
    if (at >= 0) hits.push({ at, bucket: 'room', name })
  }
  for (const item of ROOM_EN) {
    const match = [...clause.matchAll(new RegExp(item.re.source, 'gi'))].pop()
    if (match?.index != null) hits.push({ at: match.index, bucket: 'room', name: item.name })
  }
  const quoted = [...clause.matchAll(/"([^"]{1,8})"/g)].pop()
  if (quoted?.index != null && ROOM_ZH.includes(quoted[1])) {
    hits.push({ at: quoted.index, bucket: 'room', name: quoted[1] })
  }

  for (const match of clause.matchAll(/doorway|entrance|入户|门洞|推拉门|\bdoors?\b|window|\b窗\b/gi)) {
    if (match.index == null) continue
    const windowOnly = /window|窗/i.test(match[0]) && !/door|entrance|门/i.test(clause)
    hits.push({
      at: match.index,
      bucket: 'opening',
      name: openingName(clause, windowOnly ? '窗' : '门'),
      kind: windowOnly ? 'window' : 'door'
    })
  }

  const furnitureHits = furnitureHitsIn(clause)
  const hasRoom = hits.some((hit) => hit.bucket === 'room')
  if (!hasRoom) hits.push(...furnitureHits)

  if (hits.length === 0) return null
  hits.sort((a, b) => a.at - b.at)
  const closest = hits[hits.length - 1]
  return { bucket: closest.bucket, name: closest.name, kind: closest.kind }
}

function furnitureHitsIn(
  clause: string
): Array<{ at: number; bucket: 'furniture'; name: string; kind: string }> {
  const furniture = furnitureFromContext(clause)
  if (!furniture) return []
  const keys = ['wardrobe', '衣柜', 'sofa', '沙发', '餐桌', '圆桌', 'dining table', 'round table', '电视柜']
  let at = -1
  const lower = clause.toLowerCase()
  for (const key of keys) {
    const found = lower.lastIndexOf(key.toLowerCase())
    if (found > at) at = found
  }
  if (at < 0) return []
  return [{ at, bucket: 'furniture', name: furniture.name, kind: furniture.kind }]
}

function openingName(clause: string, fallback: string): string {
  const doorAt = Math.max(
    lastIndexOfRe(clause, /doorway|entrance|入户|门洞|推拉门|\bdoors?\b|window|\b窗\b/gi),
    0
  )
  const named: Array<{ at: number; name: string }> = [
    { at: lastIndexOfRe(clause, /入户|main entrance|entrance door/i), name: '入户门' },
    { at: lastIndexOfRe(clause, /厨房|kitchen/i), name: '厨房门' },
    { at: lastIndexOfRe(clause, /主卫|master bath/i), name: '主卫门' },
    { at: lastIndexOfRe(clause, /次卫|secondary bathroom|public bathroom/i), name: '次卫门' },
    { at: lastIndexOfRe(clause, /次卧|secondary bedroom/i), name: '次卧门' },
    { at: lastIndexOfRe(clause, /主卧|master bedroom/i), name: '主卧门' },
    {
      at: lastIndexOfRe(clause, /阳台|balcony|推拉/i),
      name: fallback === '窗' ? '阳台窗' : '阳台门'
    }
  ].filter((item) => item.at >= 0)
  if (named.length === 0) return fallback
  named.sort((a, b) => Math.abs(a.at - doorAt) - Math.abs(b.at - doorAt))
  return named[0].name
}

function lastIndexOfRe(text: string, re: RegExp): number {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
  const match = [...text.matchAll(new RegExp(re.source, flags))].pop()
  return match?.index ?? -1
}

function furnitureFromContext(around: string): { name: string; kind: string } | null {
  if (/wardrobe|衣柜/i.test(around)) return { name: '衣柜', kind: 'wardrobe' }
  if (/l-shaped sofa|sofa|沙发/i.test(around)) return { name: '沙发', kind: 'sofa' }
  if (/dining table|round table|餐桌|圆桌/i.test(around)) return { name: '餐桌', kind: 'table' }
  if (/\bbeds?\b|双人床|单人床|床/i.test(around) && !/bedroom/i.test(around)) {
    return { name: /单人/.test(around) ? '单人床' : '双人床', kind: 'bed' }
  }
  if (/tv cabinet|电视柜/i.test(around)) return { name: '电视柜', kind: 'storage' }
  const kind = catalogKindFromLabel(around.match(/"([^"]+)"/)?.[1])
  if (kind && kind !== 'door' && kind !== 'window') {
    return { name: around.match(/"([^"]+)"/)?.[1] ?? kind, kind }
  }
  return null
}

function addPoint(list: DetectedPoint[], point: DetectedPoint, mergeDist: number): void {
  const index = list.findIndex(
    (item) => item.name === point.name && Math.hypot(item.x - point.x, item.y - point.y) < mergeDist
  )
  if (index >= 0) {
    list[index] = point
    return
  }
  list.push(point)
}

function pickWidthMm(text: string): number | undefined {
  const json = text.match(/"overallWidthMm"\s*:\s*(\d+(?:\.\d+)?)/)
  if (json) {
    const value = Number(json[1])
    if (value >= 3000 && value <= 40000) return value
  }
  const labeled = text.match(/(\d{4,6})\s*(?:mm|毫米)/i)
  if (labeled) {
    const value = Number(labeled[1])
    if (value >= 3000 && value <= 40000) return value
  }
  return undefined
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
