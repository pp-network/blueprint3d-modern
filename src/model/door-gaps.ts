/** Door-sized gaps in a wall run, in planner centimeters. */
export const DOOR_GAP_MIN_CM = 40
export const DOOR_GAP_MAX_CM = 220

export interface DoorGapCorner {
  id: string
  x: number
  y: number
  /** The only neighbor when this corner is a dangling door jamb. */
  neighbor: { x: number; y: number } | null
}

/** Pair dangling jambs that look like a doorway (short, collinear). */
export function findDoorGapPairs(corners: DoorGapCorner[]): Array<[string, string]> {
  const dangling = corners.filter((c) => c.neighbor)
  const used = new Set<string>()
  const pairs: Array<[string, string]> = []

  for (let i = 0; i < dangling.length; i++) {
    const a = dangling[i]
    if (used.has(a.id) || !a.neighbor) continue
    let best: DoorGapCorner | null = null
    let bestDist = Infinity
    for (let j = i + 1; j < dangling.length; j++) {
      const b = dangling[j]
      if (used.has(b.id) || !b.neighbor) continue
      if (samePoint(b, a.neighbor)) continue
      if (!looksLikeDoorGap(a, b)) continue
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      if (dist < bestDist) {
        best = b
        bestDist = dist
      }
    }
    if (best) {
      used.add(a.id)
      used.add(best.id)
      pairs.push([a.id, best.id])
    }
  }
  return pairs
}

function looksLikeDoorGap(a: DoorGapCorner, b: DoorGapCorner): boolean {
  if (!a.neighbor || !b.neighbor) return false
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  if (dist < DOOR_GAP_MIN_CM || dist > DOOR_GAP_MAX_CM) return false
  const gap = normalize(b.x - a.x, b.y - a.y)
  const dirA = normalize(a.x - a.neighbor.x, a.y - a.neighbor.y)
  const dirB = normalize(b.x - b.neighbor.x, b.y - b.neighbor.y)
  if (!gap || !dirA || !dirB) return false
  return Math.abs(dot(dirA, gap)) > 0.82 && Math.abs(dot(dirB, gap)) > 0.82
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-4
}

function normalize(x: number, y: number): { x: number; y: number } | null {
  const len = Math.hypot(x, y)
  if (len < 1e-6) return null
  return { x: x / len, y: y / len }
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.x + a.y * b.y
}
