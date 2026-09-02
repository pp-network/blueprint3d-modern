import assert from 'node:assert/strict'
import { formatJudgeZh, judgeAiWallsPayload } from './judge-walls'

const cartoon = judgeAiWallsPayload({
  imageWidth: 1920,
  imageHeight: 1200,
  outerLoop: [
    { x: 450, y: 350 },
    { x: 1150, y: 350 },
    { x: 1150, y: 750 },
    { x: 750, y: 750 },
    { x: 750, y: 850 },
    { x: 450, y: 850 }
  ],
  innerWalls: [{ x1: 600, y1: 350, x2: 600, y2: 500 }]
})
assert.equal(cartoon.ok, false)
assert.ok(cartoon.notes.some((n) => n.code === 'outer-cartoon'))
assert.ok(cartoon.notes.some((n) => n.code === 'findings-missing'))

const better = judgeAiWallsPayload(
  {
    imageWidth: 1280,
    imageHeight: 831,
    outerLoop: [
      { x: 230, y: 310 },
      { x: 360, y: 310 },
      { x: 360, y: 380 },
      { x: 430, y: 380 },
      { x: 430, y: 310 },
      { x: 690, y: 310 },
      { x: 690, y: 480 },
      { x: 670, y: 480 },
      { x: 670, y: 520 },
      { x: 690, y: 520 },
      { x: 690, y: 780 },
      { x: 230, y: 780 },
      { x: 230, y: 570 },
      { x: 280, y: 570 },
      { x: 280, y: 510 },
      { x: 230, y: 510 }
    ],
    innerWalls: [
      { x1: 230, y1: 460, x2: 300, y2: 460 },
      { x1: 330, y1: 460, x2: 360, y2: 460 },
      { x1: 360, y1: 380, x2: 360, y2: 460 },
      { x1: 370, y1: 570, x2: 370, y2: 780 }
    ]
  },
  { imageWidth: 1280, imageHeight: 831 }
)
assert.equal(better.stats.outerPoints, 16)
assert.ok(better.notes.some((n) => n.code === 'image-size' && n.severity === 'ok'))
assert.ok(better.notes.some((n) => n.code === 'south-flat'))
assert.ok(better.notes.some((n) => n.code === 'findings-missing'))
assert.ok(formatJudgeZh(better).includes('隔墙'))

const sparse = judgeAiWallsPayload(
  {
    imageWidth: 1280,
    imageHeight: 978,
    outerLoop: [
      { x: 260, y: 260 },
      { x: 260, y: 170 },
      { x: 400, y: 170 },
      { x: 400, y: 100 },
      { x: 800, y: 100 },
      { x: 800, y: 200 },
      { x: 1180, y: 200 },
      { x: 1180, y: 910 },
      { x: 920, y: 910 },
      { x: 920, y: 880 },
      { x: 710, y: 880 },
      { x: 710, y: 910 },
      { x: 220, y: 910 },
      { x: 220, y: 800 },
      { x: 110, y: 800 },
      { x: 110, y: 490 },
      { x: 260, y: 490 }
    ],
    innerWalls: [
      { x1: 420, y1: 260, x2: 420, y2: 320 },
      { x1: 420, y1: 400, x2: 420, y2: 490 },
      { x1: 380, y1: 780, x2: 450, y2: 780 },
      { x1: 650, y1: 780, x2: 710, y2: 780 },
      { x1: 680, y1: 240, x2: 680, y2: 540 },
      { x1: 920, y1: 540, x2: 920, y2: 910 }
    ]
  },
  {
    imageWidth: 1280,
    imageHeight: 978,
    placements: {
      rooms: [
        { name: '厨房', x: 430, y: 300 },
        { name: '餐厅', x: 560, y: 380 },
        { name: '客厅', x: 500, y: 680 },
        { name: '男孩房', x: 850, y: 700 },
        { name: '主卧', x: 1000, y: 780 },
        { name: '主卫', x: 1080, y: 600 },
        { name: '女孩房', x: 1050, y: 350 },
        { name: '阅读书房', x: 310, y: 700 }
      ],
      furniture: [],
      openings: [{ kind: 'door', name: '入户门', x: 260, y: 400 }]
    }
  }
)
assert.equal(sparse.ok, false, 'sparse partitions must fail')
assert.ok(
  sparse.notes.some((n) => n.code === 'rooms-unclosed' || n.code === 'inner-vs-rooms' || n.code === 'door-gap-wide'),
  'sparse plan is flagged'
)

const straightBearing = judgeAiWallsPayload(
  {
    imageWidth: 1280,
    imageHeight: 978,
    outerLoop: [
      { x: 100, y: 100 },
      { x: 1100, y: 100 },
      { x: 1100, y: 880 },
      { x: 100, y: 880 },
      { x: 100, y: 600 },
      { x: 140, y: 600 },
      { x: 140, y: 400 },
      { x: 100, y: 400 }
    ],
    innerWalls: [
      { x1: 400, y1: 100, x2: 400, y2: 880 },
      { x1: 700, y1: 100, x2: 700, y2: 880 },
      { x1: 100, y1: 500, x2: 1100, y2: 500 }
    ]
  },
  {
    imageWidth: 1280,
    imageHeight: 978,
    placements: {
      rooms: [
        { name: '厨房', x: 250, y: 250 },
        { name: '餐厅', x: 250, y: 700 },
        { name: '客厅', x: 550, y: 400 },
        { name: '主卧', x: 900, y: 250 },
        { name: '次卧', x: 900, y: 700 },
        { name: '书房', x: 550, y: 700 }
      ],
      furniture: [],
      openings: [{ kind: 'door', name: '门', x: 400, y: 400 }]
    }
  }
)
assert.ok(
  straightBearing.notes.some((n) => n.code === 'bearing-jogs'),
  'straight-only partitions miss bearing jogs'
)

const overlapping = judgeAiWallsPayload({
  imageWidth: 1280,
  imageHeight: 978,
  outerLoop: [
    { x: 100, y: 100 },
    { x: 400, y: 100 },
    { x: 700, y: 100 },
    { x: 1100, y: 100 },
    { x: 1100, y: 880 },
    { x: 700, y: 880 },
    { x: 400, y: 880 },
    { x: 100, y: 880 }
  ],
  innerWalls: [
    { x1: 790, y1: 560, x2: 1004, y2: 560 },
    { x1: 827, y1: 560, x2: 860, y2: 560 },
    { x1: 920, y1: 560, x2: 1004, y2: 560 },
    { x1: 400, y1: 100, x2: 400, y2: 880 },
    { x1: 411, y1: 440, x2: 430, y2: 440 },
    { x1: 280, y1: 482, x2: 300, y2: 482 },
    { x1: 360, y1: 482, x2: 380, y2: 482 },
    { x1: 660, y1: 440, x2: 687, y2: 440 }
  ]
})
assert.equal(overlapping.ok, false)
assert.ok(overlapping.notes.some((n) => n.code === 'inner-overlap'))

const titleStrip = judgeAiWallsPayload(
  {
    imageWidth: 1280,
    imageHeight: 978,
    outerLoop: [
      { x: 100, y: 100 },
      { x: 400, y: 100 },
      { x: 700, y: 100 },
      { x: 1100, y: 100 },
      { x: 1100, y: 880 },
      { x: 700, y: 880 },
      { x: 400, y: 880 },
      { x: 100, y: 880 }
    ],
    innerWalls: [
      { x1: 400, y1: 100, x2: 400, y2: 880 },
      { x1: 700, y1: 100, x2: 700, y2: 400 },
      { x1: 700, y1: 480, x2: 700, y2: 880 },
      { x1: 400, y1: 500, x2: 700, y2: 500 },
      { x1: 700, y1: 500, x2: 1100, y2: 500 }
    ]
  },
  {
    imageWidth: 1280,
    imageHeight: 978,
    placements: {
      rooms: [
        { name: '厨房', x: 410, y: 350 },
        { name: '餐厅', x: 535, y: 350 },
        { name: '次卫', x: 740, y: 350 },
        { name: '衣帽间', x: 895, y: 350 },
        { name: '女孩房', x: 1090, y: 350 },
        { name: '客厅', x: 535, y: 670 }
      ],
      furniture: [],
      openings: [{ kind: 'door', name: '门', x: 400, y: 400 }]
    }
  }
)
assert.ok(
  titleStrip.notes.some((n) => n.code === 'rooms-title-strip'),
  'room names stacked on one y are flagged'
)

console.log('judge-walls.test ok')
