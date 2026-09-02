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

export interface WorldBBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
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

/** Lay the image under existing walls. Reuses the last scale when possible. */
export function createOverlayAlignedToWalls(
  image: HTMLImageElement,
  walls: WorldBBox,
  options?: {
    overallWidthCm?: number
    prior?: OverlayTransform | null
    opacity?: number
    locked?: boolean
  }
): FloorplanOverlay {
  const widthPx = image.naturalWidth || image.width || 1
  const heightPx = image.naturalHeight || image.height || 1
  const wallWidth = Math.max(1, walls.maxX - walls.minX)
  const cx = (walls.minX + walls.maxX) / 2
  const cy = (walls.minY + walls.maxY) / 2
  const prior = options?.prior
  const overlay =
    prior && prior.cmPerImagePixel > 0
      ? {
          image,
          originX: prior.originX,
          originY: prior.originY,
          cmPerImagePixel: prior.cmPerImagePixel,
          opacity: options?.opacity ?? 0.55,
          locked: options?.locked ?? true
        }
      : createOverlay(image, cx, cy, options?.overallWidthCm && options.overallWidthCm > 0 ? options.overallWidthCm : wallWidth)
  if (options?.opacity != null) overlay.opacity = options.opacity
  if (options?.locked != null) overlay.locked = options.locked
  if (options?.overallWidthCm && options.overallWidthCm > 0) {
    scaleOverlayToPixelWidth(overlay, widthPx, options.overallWidthCm, widthPx / 2, heightPx / 2)
  }
  return overlay
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
