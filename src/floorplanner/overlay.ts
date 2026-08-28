/** 2D-only tracing image. Never written into exportSerialized(). */
export interface FloorplanOverlay {
  image: HTMLImageElement
  /** World-cm position of the image top-left. */
  originX: number
  originY: number
  /** World centimeters per image pixel. */
  cmPerImagePixel: number
  opacity: number
  locked: boolean
}

export function createOverlay(
  image: HTMLImageElement,
  centerX: number,
  centerY: number,
  targetWidthCm = 2000
): FloorplanOverlay {
  const widthPx = image.naturalWidth || image.width || 1
  const heightPx = image.naturalHeight || image.height || 1
  const safeWidthCm = targetWidthCm > 0 ? targetWidthCm : 2000
  const cmPerImagePixel = safeWidthCm / widthPx
  return {
    image,
    originX: centerX - (widthPx * cmPerImagePixel) / 2,
    originY: centerY - (heightPx * cmPerImagePixel) / 2,
    cmPerImagePixel,
    opacity: 0.55,
    locked: true
  }
}

/** Scale overlay so a pixel-space width becomes realWidthCm, keeping the bbox center fixed. */
export function scaleOverlayToPixelWidth(
  overlay: FloorplanOverlay,
  pixelWidth: number,
  realWidthCm: number,
  bboxCenterX: number,
  bboxCenterY: number
): void {
  if (pixelWidth < 1e-6 || realWidthCm <= 0) {
    return
  }
  const old = overlay.cmPerImagePixel
  const worldCx = overlay.originX + bboxCenterX * old
  const worldCy = overlay.originY + bboxCenterY * old
  overlay.cmPerImagePixel = realWidthCm / pixelWidth
  overlay.originX = worldCx - bboxCenterX * overlay.cmPerImagePixel
  overlay.originY = worldCy - bboxCenterY * overlay.cmPerImagePixel
}

export interface OverlayTransform {
  originX: number
  originY: number
  cmPerImagePixel: number
}

export function copyOverlayTransform(overlay: FloorplanOverlay): OverlayTransform {
  return {
    originX: overlay.originX,
    originY: overlay.originY,
    cmPerImagePixel: overlay.cmPerImagePixel
  }
}

export function restoreOverlayTransform(overlay: FloorplanOverlay, snap: OverlayTransform): void {
  overlay.originX = snap.originX
  overlay.originY = snap.originY
  overlay.cmPerImagePixel = snap.cmPerImagePixel
}

/** Scale overlay so the distance between two world points becomes realLengthCm. */
export function applyCalibration(
  overlay: FloorplanOverlay,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  realLengthCm: number
): void {
  const current = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (current < 1e-6 || realLengthCm <= 0) {
    return
  }
  const scale = realLengthCm / current
  const px1 = (p1.x - overlay.originX) / overlay.cmPerImagePixel
  const py1 = (p1.y - overlay.originY) / overlay.cmPerImagePixel
  overlay.cmPerImagePixel *= scale
  overlay.originX = p1.x - px1 * overlay.cmPerImagePixel
  overlay.originY = p1.y - py1 * overlay.cmPerImagePixel
}
