import {
  aiWallsToTrace,
  aiWallsToTracePartial,
  alignPayloadToImage,
  critiqueAiWalls,
  critiqueFromOutput,
  extractFloorplanFindings,
  extractFloorplanPlacements,
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
const closedDup = parseAiWallsPayload({
  imageWidth: 100,
  imageHeight: 80,
  outerLoop: [
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 90, y: 70 },
    { x: 10, y: 70 },
    { x: 10, y: 10 }
  ]
})
assert(closedDup.outerLoop.length === 4, 'drop repeated closing point')
const withFindings = parseAiWallsPayload({
  imageWidth: 100,
  imageHeight: 80,
  outerLoop: [
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 90, y: 70 },
    { x: 10, y: 70 }
  ],
  findings: { rooms: [{ name: '客厅', x: 40, y: 40 }], openings: [{ kind: 'door', name: '门', x: 10, y: 40 }] }
})
assert(Boolean(withFindings.findings), 'findings kept on payload')
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
assert(!extractFloorplanFindings(
  '{"findings":{"furniture":[{"kind":"table","name":"餐桌","x":1,"y":2}]}}'
)!.furniture.includes('table'), 'findings use Chinese names only')

const oob = parseAiWallsPayload({
  imageWidth: 1200,
  imageHeight: 850,
  outerLoop: [
    { x: 10, y: 10 },
    { x: 100, y: 10 },
    { x: 100, y: 880 },
    { x: 10, y: 80 }
  ]
})
assert(oob.outerLoop[2].y === 850, 'clamp outer y into image')

const sample = `
{"imageWidth":1200,"imageHeight":850,"outerLoop":[{"x":130,"y":360},{"x":370,"y":360},{"x":1120,"y":210},{"x":1120,"y":850},{"x":910,"y":880},{"x":130,"y":730}],"innerWalls":[{"x1":370,"y1":520,"x2":450,"y2":520}],"findings":{"rooms":[{"name":"厨房","x":1,"y":1},{"name":"餐厅","x":2,"y":2},{"name":"客厅","x":3,"y":3},{"name":"书房","x":4,"y":4},{"name":"次卫","x":5,"y":5},{"name":"主卧","x":6,"y":6}],"openings":[{"kind":"door","name":"门","x":1,"y":1}]}}
`
const notes = critiqueFromOutput(sample, extractFloorplanPlacements(sample))
assert(notes.some((n) => n.includes('图外')), 'critique out of bounds')
assert(notes.some((n) => n.includes('左侧')), 'critique west facade')
assert(notes.some((n) => n.includes('隔墙')), 'critique sparse inner walls')
assert(critiqueAiWalls(oob, 0, 0).every((n) => !n.includes('图外')), 'clamped payload is in-bounds')

const placements = extractFloorplanPlacements(
  '{"findings":{"rooms":[{"name":"主卧","x":10,"y":20}],"furniture":[{"kind":"sofa","name":"沙发","x":30,"y":40},{"kind":"door","name":"门","x":5,"y":6}],"openings":[{"kind":"window","name":"窗","x":1,"y":2}]}}'
)
assert(placements !== null, 'placements exist')
assert(placements!.rooms[0].name === '主卧', 'room point')
assert(placements!.furniture.length === 1 && placements!.furniture[0].kind === 'sofa', 'sofa stays furniture')
assert(placements!.openings.length === 2, 'door+window openings')

const mixed = extractPartialAiWalls(
  '{"imageWidth":100,"imageHeight":80,"outerLoop":[{"x":10,"y":10},{"x":90,"y":10},{"x":90,"y":70},{"x":10,"y":70}],"findings":{"rooms":[{"name":"客厅","x":50,"y":40}],"furniture":[{"kind":"bed","name":"双人床","x":55,"y":45}]},"innerWalls":[]}'
)
assert(mixed !== null, 'mixed exists')
assert(mixed!.outerLoop.length === 4, `outer must ignore furniture points ${mixed?.outerLoop.length}`)
assert(!mixed!.outerLoop.some((p) => p.x === 50 && p.y === 40), 'room point is not a wall')

const scaled = alignPayloadToImage(
  {
    imageWidth: 1000,
    imageHeight: 500,
    outerLoop: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 500 },
      { x: 0, y: 500 }
    ]
  },
  2000,
  1000
)
assert(scaled.imageWidth === 2000, 'align width')
assert(scaled.outerLoop[1].x === 2000, 'scale outer x')

console.log('ai-walls-schema.test ok')
