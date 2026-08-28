import {
  aiWallsToTrace,
  aiWallsToTracePartial,
  extractFloorplanFindings,
  extractJsonObject,
  extractPartialAiWalls,
  formatFindingsZh,
  parseAiWallsPayload
} from './ai-walls-schema'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const parsed = extractJsonObject('here ```json\n{"imageWidth":100,"imageHeight":80,"outerLoop":[{"x":10,"y":10},{"x":90,"y":10},{"x":90,"y":70},{"x":10,"y":70}]}\n```')
const payload = parseAiWallsPayload(parsed)
assert(payload.outerLoop.length === 4, 'loop size')
const manyCorners = Array.from({ length: 40 }, (_, i) => ({ x: i, y: i % 2 }))
const dense = parseAiWallsPayload({
  imageWidth: 100,
  imageHeight: 80,
  outerLoop: manyCorners
})
assert(dense.outerLoop.length === 40, 'facade jogs allowed')
const trace = aiWallsToTrace(payload, 200, 160)
assert(trace.segments.length === 4, `outer walls ${trace.segments.length}`)
assert(Math.abs(trace.segments[0].x2 - 180) < 1, 'scale x')

let threw = false
try {
  parseAiWallsPayload({ imageWidth: 10, imageHeight: 10, outerLoop: [{ x: 1, y: 1 }] })
} catch {
  threw = true
}
assert(threw, 'short loop must fail closed')

const partial = extractPartialAiWalls(
  '{"imageWidth":100,"imageHeight":80,"outerLoop":[{"x":10,"y":10},{"x":90,"y":10},{"x":90,"y":70}'
)
assert(partial !== null, 'partial exists')
assert(partial!.complete === false, 'partial not complete')
assert(partial!.outerLoop.length === 3, `partial points ${partial!.outerLoop.length}`)
assert(partial!.closeLoop === false, 'truncated loop stays open')
const openTrace = aiWallsToTracePartial(partial!, 200, 160, false)
assert(openTrace !== null && openTrace.segments.length === 2, `open segments ${openTrace?.segments.length}`)

const findings = extractFloorplanFindings(
  '{"findings":{"overallWidthMm":18670,"rooms":[{"name":"客厅","x":1,"y":2}],"furniture":[{"kind":"bed","name":"双人床","x":3,"y":4}]}}'
)
assert(findings !== null, 'findings exist')
assert(findings!.overallWidthMm === 18670, 'ocr width')
assert(findings!.rooms.includes('客厅'), 'room name')
assert(findings!.furniture.includes('双人床'), 'furniture name')
assert(formatFindingsZh(findings!).includes('总宽'), 'zh summary')

const mixed = extractPartialAiWalls(
  '{"imageWidth":100,"imageHeight":80,"outerLoop":[{"x":10,"y":10},{"x":90,"y":10},{"x":90,"y":70},{"x":10,"y":70}],"findings":{"rooms":[{"name":"客厅","x":50,"y":40}],"furniture":[{"kind":"bed","name":"双人床","x":55,"y":45}]},"innerWalls":[]}'
)
assert(mixed !== null, 'mixed exists')
assert(mixed!.outerLoop.length === 4, `outer must ignore furniture points ${mixed?.outerLoop.length}`)
assert(!mixed!.outerLoop.some((p) => p.x === 50 && p.y === 40), 'room point is not a wall')

console.log('ai-walls-schema.test ok')
