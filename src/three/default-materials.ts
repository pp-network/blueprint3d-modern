import * as THREE from 'three'

const REMOTE_DEFAULTS = [
  'https://cdn-images.lumenfeng.com/models-cover/hardwood.png',
  'https://cdn-images.lumenfeng.com/models-cover/wallmap.png'
]

export function isRemoteDefaultTexture(url?: string): boolean {
  return !url || REMOTE_DEFAULTS.includes(url)
}

export function makeWoodFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('canvas 2d unavailable')
  }
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = y % 64 === 0 ? '#c4a06a' : '#d2b184'
    ctx.fillRect(0, y, 256, 30)
    ctx.strokeStyle = 'rgba(90, 55, 20, 0.28)'
    ctx.beginPath()
    ctx.moveTo(0, y + 30)
    ctx.lineTo(256, y + 30)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(90, 55, 20, 0.08)'
    ctx.beginPath()
    ctx.moveTo(40 + (y % 80), y)
    ctx.lineTo(40 + (y % 80), y + 30)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(4, 4)
  return texture
}

export function makePlasterWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('canvas 2d unavailable')
  }
  ctx.fillStyle = '#efe6d8'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(180, 160, 140, ${0.04 + (i % 5) * 0.01})`
    ctx.fillRect((i * 37) % 256, (i * 53) % 256, 18, 10)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

export function loadTextureOrFallback(
  url: string | undefined,
  fallback: () => THREE.Texture
): THREE.Texture {
  if (isRemoteDefaultTexture(url)) {
    return fallback()
  }
  const texture = fallback()
  const loader = new THREE.TextureLoader()
  loader.load(
    url!,
    (loaded) => {
      texture.image = loaded.image
      texture.colorSpace = THREE.SRGBColorSpace
      texture.needsUpdate = true
    },
    undefined,
    () => {
      /* keep canvas fallback */
    }
  )
  return texture
}
