import assert from 'node:assert/strict'
import { Floorplan } from '../model/floorplan'
import { overlayScaleFromTrace } from './apply-trace'
import { aiWallsToTrace } from './ai-walls-schema'
import { savedFloorplanFromWorldSegments, worldSegmentsFromTrace } from './build-floorplan'
import { stitchWallTrace } from './stitch-walls'

const innerOnly = overlayScaleFromTrace({
  imageWidth: 1280,
  imageHeight: 831,
  bbox: { minX: 430, minY: 380, maxX: 590, maxY: 630 }
})
assert.equal(innerOnly.pixelWidth, 1280, 'scale uses full image, not inner bbox')
assert.equal(innerOnly.centerX, 640)
assert.equal(innerOnly.centerY, 415.5)

const noImage = overlayScaleFromTrace({
  bbox: { minX: 10, minY: 20, maxX: 110, maxY: 80 }
})
assert.equal(noImage.pixelWidth, 100)
assert.equal(noImage.centerX, 60)
assert.equal(noImage.centerY, 50)

const messy = aiWallsToTrace(
  {
    imageWidth: 1280,
    imageHeight: 978,
    outerLoop: [
      { x: 100, y: 100 },
      { x: 1100, y: 100 },
      { x: 1100, y: 800 },
      { x: 100, y: 800 },
      { x: 100, y: 100 }
    ],
    innerWalls: [
      { x1: 790, y1: 560, x2: 1004, y2: 560 },
      { x1: 827, y1: 560, x2: 860, y2: 560 },
      { x1: 920, y1: 560, x2: 1004, y2: 560 },
      { x1: 1004, y1: 100, x2: 1004, y2: 800 },
      { x1: 400, y1: 100, x2: 400, y2: 800 }
    ]
  },
  1280,
  978
)
const stitched = stitchWallTrace(messy)
const floorplan = savedFloorplanFromWorldSegments(worldSegmentsFromTrace(stitched, 0, 0, 1))
const loaded = new Floorplan()
loaded.loadFloorplan(floorplan)
for (const room of loaded.getRooms()) {
  for (const corner of room.interiorCorners) {
    assert.ok(Number.isFinite(corner.x) && Number.isFinite(corner.y), 'room corner finite')
  }
}

console.log('apply-trace.test ok')
