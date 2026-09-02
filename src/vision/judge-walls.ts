import type { AiWallsPayload } from './ai-walls-schema'
import { extractFloorplanPlacements, type FloorplanPlacements } from './ai-walls-schema'

export type JudgeSeverity = 'error' | 'warn' | 'ok'

export interface JudgeNote {
  severity: JudgeSeverity
  code: string
  message: string
}

export interface JudgeWallsResult {
  ok: boolean
  notes: JudgeNote[]
  stats: {
    imageWidth: number
    imageHeight: number
    outerPoints: number
    innerWalls: number
    rooms: number
    doors: number
    windows: number
    furniture: number
    overallWidthMm: number | null
  }
}

export function judgeAiWallsPayload(
  payload: AiWallsPayload,
  options?: {
    imageWidth?: number
    imageHeight?: number
    overallWidthMm?: number
    placements?: FloorplanPlacements | null
    rawOutput?: string
  }
): JudgeWallsResult {
  const notes: JudgeNote[] = []
  const w = payload.imageWidth
  const h = payload.imageHeight
  const outer = payload.outerLoop ?? []
  const inner = payload.innerWalls ?? []
  const placements =
    options?.placements ?? (options?.rawOutput ? extractFloorplanPlacements(options.rawOutput) : null)

  if (options?.imageWidth && options.imageHeight) {
    if (Math.abs(w - options.imageWidth) > 2 || Math.abs(h - options.imageHeight) > 2) {
      notes.push({
        severity: 'error',
        code: 'image-size',
        message: `模型写了 ${w}×${h}，附图实际是 ${options.imageWidth}×${options.imageHeight}`
      })
    } else {
      notes.push({
        severity: 'ok',
        code: 'image-size',
        message: `图像尺寸 ${w}×${h} 与附图一致`
      })
    }
  }

  if ((w === 1920 && h === 1080) || (w === 1920 && h === 1200)) {
    if (!options?.imageWidth || options.imageWidth !== w) {
      notes.push({
        severity: 'error',
        code: 'invented-resolution',
        message: '图像尺寸像是编造的 1920 宽，没有用附图真实像素'
      })
    }
  }

  const oob = outer.some((p) => p.x < 0 || p.y < 0 || p.x > w || p.y > h)
  const innerOob = inner.some(
    (s) => s.x1 < 0 || s.y1 < 0 || s.x2 < 0 || s.y2 < 0 || s.x1 > w || s.x2 > w || s.y1 > h || s.y2 > h
  )
  if (oob || innerOob) {
    notes.push({
      severity: 'error',
      code: 'out-of-bounds',
      message: '有坐标画出图像范围'
    })
  }

  if (outer.length < 4) {
    notes.push({
      severity: 'error',
      code: 'outer-too-few',
      message: `外墙只有 ${outer.length} 个点，无法成圈`
    })
  } else if (outer.length <= 6) {
    notes.push({
      severity: 'error',
      code: 'outer-cartoon',
      message: `外墙只有 ${outer.length} 个点，是示意矩形/L，不是描出来的墙角`
    })
  } else {
    notes.push({
      severity: 'ok',
      code: 'outer-count',
      message: `外墙 ${outer.length} 个点`
    })
  }

  if (outer.length >= 3) {
    const xs = outer.map((p) => p.x)
    const ys = outer.map((p) => p.y)
    const west = Math.min(...xs)
    const south = Math.max(...ys)
    const westJogs = new Set(
      outer.filter((p) => Math.abs(p.x - west) <= w * 0.03).map((p) => Math.round(p.y / 20))
    )
    if (westJogs.size <= 2) {
      notes.push({
        severity: 'warn',
        code: 'west-flat',
        message: '左侧外墙几乎是一条竖线，入口退线/凸出可能漏了'
      })
    }
    const southJogs = new Set(
      outer.filter((p) => Math.abs(p.y - south) <= h * 0.03).map((p) => Math.round(p.x / 20))
    )
    if (southJogs.size <= 2) {
      notes.push({
        severity: 'warn',
        code: 'south-flat',
        message: '南侧外墙是一条平线，景观阳台外凸可能漏了'
      })
    }
  }

  if (inner.length === 0) {
    notes.push({
      severity: 'error',
      code: 'no-inner',
      message: '没有隔墙'
    })
  } else {
    const stubs = inner.filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 40)
    notes.push({
      severity: 'ok',
      code: 'inner-count',
      message: `隔墙 ${inner.length} 段`
    })
    if (stubs.length >= Math.ceil(inner.length * 0.35)) {
      notes.push({
        severity: stubs.length >= 10 ? 'error' : 'warn',
        code: 'inner-stubs',
        message: `${stubs.length}/${inner.length} 段隔墙短于 40px，多半是尺寸刻度或没接到墙`
      })
    }
    const overlaps = countOverlappingInners(inner)
    if (overlaps >= 2) {
      notes.push({
        severity: 'error',
        code: 'inner-overlap',
        message: `${overlaps} 组隔墙叠在同一条线上，会算出 NaN 房间，也容易把标注描成墙`
      })
    }
  }

  const rooms = placements?.rooms.length ?? 0
  const doors = placements?.openings.filter((o) => o.kind === 'door').length ?? 0
  const windows = placements?.openings.filter((o) => o.kind === 'window').length ?? 0
  const furniture = placements?.furniture.length ?? 0
  const overallWidthMm = placements?.overallWidthMm ?? options?.overallWidthMm ?? null

  if (!placements) {
    notes.push({
      severity: 'error',
      code: 'findings-missing',
      message: 'JSON 没有 findings（房间/门窗/家具），API 结果不完整'
    })
  } else {
    if (rooms < 4) {
      notes.push({
        severity: 'warn',
        code: 'rooms-few',
        message: `只读到 ${rooms} 个房间名`
      })
    }
    if (rooms >= 6 && inner.length < rooms) {
      notes.push({
        severity: 'error',
        code: 'inner-vs-rooms',
        message: `隔墙只有 ${inner.length} 段，不够分开 ${rooms} 个房间`
      })
    } else if (rooms >= 6 && inner.length < rooms * 1.6) {
      notes.push({
        severity: 'warn',
        code: 'inner-vs-rooms',
        message: '隔墙偏少，有名字的房间可能没分开'
      })
    }

    const segs = [...loopToSegments(outer), ...inner]
    const unclosed = unclosedNamedRooms(placements.rooms, segs, Math.max(w, h) * 0.32)
    if (unclosed.length >= 2) {
      notes.push({
        severity: 'error',
        code: 'rooms-unclosed',
        message: `${unclosed.length} 个房间没有被墙围住：${unclosed.slice(0, 6).join('、')}`
      })
    } else if (unclosed.length > 0) {
      notes.push({
        severity: 'warn',
        code: 'rooms-unclosed',
        message: `未围住：${unclosed.join('、')}`
      })
    }

    const minDim = Math.min(w, h)
    const longCount = inner.filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= minDim * 0.2).length
    if (rooms >= 6 && longCount < 2) {
      notes.push({
        severity: 'error',
        code: 'bearing-few',
        message: '几乎没有通长隔墙，粗黑承重墙（走廊/分户墙）可能没描'
      })
    } else if (rooms >= 6 && longCount < 4) {
      notes.push({
        severity: 'warn',
        code: 'bearing-few',
        message: '通长承重隔墙偏少，粗黑线拐弯墙可能漏了'
      })
    }
    const jogs = countBearingJogs(inner)
    if (rooms >= 6 && jogs < 2) {
      notes.push({
        severity: 'warn',
        code: 'bearing-jogs',
        message: '粗承重墙几乎没有拐弯，折线墙可能被拉成了直线'
      })
    }

    const wideGaps = countWideCollinearGaps(inner)
    if (roomsOnTitleStrip(placements.rooms)) {
      notes.push({
        severity: 'warn',
        code: 'rooms-title-strip',
        message: '多个房间名挤在同一水平线上，像点在客厅中间的目录横条上'
      })
    }

    if (wideGaps.count >= 2) {
      notes.push({
        severity: 'warn',
        code: 'door-gap-wide',
        message: `${wideGaps.count} 处门洞空隙偏大（最大 ${wideGaps.maxPx}px），应只空约一扇门`
      })
    }
    if (doors === 0) {
      notes.push({
        severity: 'warn',
        code: 'no-doors',
        message: 'openings 里没有门'
      })
    }
  }

  if (options?.overallWidthMm && options.overallWidthMm > 0 && !overallWidthMm) {
    notes.push({
      severity: 'warn',
      code: 'width-missing',
      message: `用户标了总宽 ${options.overallWidthMm} mm，结果里没写 overallWidthMm`
    })
  }

  const ok = notes.every((n) => n.severity !== 'error')
  return {
    ok,
    notes,
    stats: {
      imageWidth: w,
      imageHeight: h,
      outerPoints: outer.length,
      innerWalls: inner.length,
      rooms,
      doors,
      windows,
      furniture,
      overallWidthMm
    }
  }
}

export function formatJudgeZh(result: JudgeWallsResult): string {
  const s = result.stats
  const head = result.ok ? 'API 结果通过结构检查' : 'API 结果未通过结构检查'
  const lines = [
    head,
    `外墙 ${s.outerPoints} 点，隔墙 ${s.innerWalls} 段，房间 ${s.rooms}，门 ${s.doors}，窗 ${s.windows}，家具 ${s.furniture}`
  ]
  for (const note of result.notes) {
    const mark = note.severity === 'ok' ? '✓' : note.severity === 'warn' ? '!' : '×'
    lines.push(`${mark} ${note.message}`)
  }
  return lines.join('\n')
}

type JudgeSeg = { x1: number; y1: number; x2: number; y2: number }

function loopToSegments(loop: Array<{ x: number; y: number }>): JudgeSeg[] {
  if (loop.length < 2) return []
  return loop.map((point, i) => {
    const next = loop[(i + 1) % loop.length]
    return { x1: point.x, y1: point.y, x2: next.x, y2: next.y }
  })
}

function isVertical(seg: JudgeSeg): boolean {
  return Math.abs(seg.x1 - seg.x2) <= 18 && Math.abs(seg.y1 - seg.y2) >= 20
}

function isHorizontal(seg: JudgeSeg): boolean {
  return Math.abs(seg.y1 - seg.y2) <= 18 && Math.abs(seg.x1 - seg.x2) >= 20
}

function yCovers(seg: JudgeSeg, y: number): boolean {
  return y >= Math.min(seg.y1, seg.y2) - 28 && y <= Math.max(seg.y1, seg.y2) + 28
}

function xCovers(seg: JudgeSeg, x: number): boolean {
  return x >= Math.min(seg.x1, seg.x2) - 28 && x <= Math.max(seg.x1, seg.x2) + 28
}

function sidesBlocked(x: number, y: number, segs: JudgeSeg[], reach: number): number {
  let n = 0
  if (segs.some((s) => isVertical(s) && Math.max(s.x1, s.x2) <= x + 8 && x - Math.max(s.x1, s.x2) < reach && yCovers(s, y))) {
    n += 1
  }
  if (segs.some((s) => isVertical(s) && Math.min(s.x1, s.x2) >= x - 8 && Math.min(s.x1, s.x2) - x < reach && yCovers(s, y))) {
    n += 1
  }
  if (segs.some((s) => isHorizontal(s) && Math.max(s.y1, s.y2) <= y + 8 && y - Math.max(s.y1, s.y2) < reach && xCovers(s, x))) {
    n += 1
  }
  if (segs.some((s) => isHorizontal(s) && Math.min(s.y1, s.y2) >= y - 8 && Math.min(s.y1, s.y2) - y < reach && xCovers(s, x))) {
    n += 1
  }
  return n
}

function requiredSides(name: string): number {
  return /阳台|客厅|餐厅|玄关/.test(name) ? 3 : 4
}

function unclosedNamedRooms(
  rooms: Array<{ name: string; x: number; y: number }>,
  segs: JudgeSeg[],
  reach: number
): string[] {
  const seen = new Set<string>()
  const missing: string[] = []
  for (const room of rooms) {
    const name = room.name.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    if (sidesBlocked(room.x, room.y, segs, reach) < requiredSides(name)) missing.push(name)
  }
  return missing
}

function roomsOnTitleStrip(rooms: Array<{ name: string; x: number; y: number }>): boolean {
  const buckets = new Map<number, number>()
  for (const room of rooms) {
    const y = Math.round(room.y / 25)
    buckets.set(y, (buckets.get(y) ?? 0) + 1)
  }
  return Math.max(0, ...buckets.values()) >= 4
}

function countWideCollinearGaps(inner: JudgeSeg[]): { count: number; maxPx: number } {
  const groups = new Map<string, Array<{ a: number; b: number }>>()
  const add = (key: string, a: number, b: number) => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const list = groups.get(key) ?? []
    list.push({ a: lo, b: hi })
    groups.set(key, list)
  }
  for (const seg of inner) {
    if (isVertical(seg)) add(`v:${Math.round((seg.x1 + seg.x2) / 24)}`, seg.y1, seg.y2)
    else if (isHorizontal(seg)) add(`h:${Math.round((seg.y1 + seg.y2) / 24)}`, seg.x1, seg.x2)
  }
  let count = 0
  let maxPx = 0
  for (const list of groups.values()) {
    list.sort((a, b) => a.a - b.a)
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].a - list[i - 1].b
      if (gap > 90 && gap <= 150) {
        count += 1
        maxPx = Math.max(maxPx, Math.round(gap))
      }
    }
  }
  return { count, maxPx }
}

function countOverlappingInners(inner: JudgeSeg[]): number {
  let n = 0
  for (let i = 0; i < inner.length; i++) {
    for (let j = i + 1; j < inner.length; j++) {
      const a = inner[i]
      const b = inner[j]
      const aH = isHorizontal(a)
      const bH = isHorizontal(b)
      if (aH !== bH) continue
      if (aH) {
        if (Math.abs((a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2) > 8) continue
        if (rangeOverlap(a.x1, a.x2, b.x1, b.x2) > 8) n += 1
      } else {
        if (Math.abs((a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2) > 8) continue
        if (rangeOverlap(a.y1, a.y2, b.y1, b.y2) > 8) n += 1
      }
    }
  }
  return n
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2))
}

function countBearingJogs(inner: JudgeSeg[]): number {
  let n = 0
  for (let i = 0; i < inner.length; i++) {
    for (let j = i + 1; j < inner.length; j++) {
      const a = inner[i]
      const b = inner[j]
      if (Math.hypot(a.x2 - a.x1, a.y2 - a.y1) < 60) continue
      if (Math.hypot(b.x2 - b.x1, b.y2 - b.y1) < 60) continue
      const crossed = (isHorizontal(a) && isVertical(b)) || (isVertical(a) && isHorizontal(b))
      if (!crossed) continue
      const endsA = [
        { x: a.x1, y: a.y1 },
        { x: a.x2, y: a.y2 }
      ]
      const endsB = [
        { x: b.x1, y: b.y1 },
        { x: b.x2, y: b.y2 }
      ]
      if (endsA.some((p) => endsB.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 16))) n += 1
    }
  }
  return n
}
