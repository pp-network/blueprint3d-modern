import { applyCalibration, copyOverlayTransform, createOverlay, restoreOverlayTransform } from './overlay'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const image = { naturalWidth: 4000, naturalHeight: 2000, width: 4000, height: 2000 } as HTMLImageElement
const overlay = createOverlay(image, 0, 0, 2000)
assert(Math.abs(overlay.cmPerImagePixel - 0.5) < 1e-9, 'fit width to 2000cm')
assert(Math.abs(overlay.originX + 1000) < 1e-6, 'centered origin x')
assert(Math.abs(overlay.originY + 500) < 1e-6, 'centered origin y')

const p1 = { x: overlay.originX, y: 0 }
const p2 = { x: overlay.originX + 2000, y: 0 }
const before = copyOverlayTransform(overlay)
applyCalibration(overlay, p1, p2, 1867)
assert(Math.abs(overlay.cmPerImagePixel - 1867 / 4000) < 1e-6, 'calibrate to 1867cm')
restoreOverlayTransform(overlay, before)
assert(Math.abs(overlay.cmPerImagePixel - before.cmPerImagePixel) < 1e-9, 'undo calibration scale')
assert(Math.abs(overlay.originX - before.originX) < 1e-9, 'undo calibration origin x')
assert(Math.abs(overlay.originY - before.originY) < 1e-9, 'undo calibration origin y')

console.log('overlay.test ok')
