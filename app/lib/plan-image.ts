export function encodePlanImage(
  image: HTMLImageElement,
  maxWidth = 1280
): { dataUrl: string; width: number; height: number; mimeType: 'image/jpeg' } {
  const srcW = image.naturalWidth || image.width
  const srcH = image.naturalHeight || image.height
  const scale = Math.min(1, maxWidth / Math.max(1, srcW))
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('canvas 2d context unavailable')
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.86),
    width,
    height,
    mimeType: 'image/jpeg'
  }
}
