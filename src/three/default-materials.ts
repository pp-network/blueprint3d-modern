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

export function makeLocalTexture(url: string): THREE.CanvasTexture {
  if (url === 'local:floor-wood-dark') {
    return paintCanvas((ctx) => {
      for (let y = 0; y < 256; y += 32) {
        ctx.fillStyle = y % 64 === 0 ? '#6e4320' : '#8b5a2b'
        ctx.fillRect(0, y, 256, 30)
        ctx.strokeStyle = 'rgba(40, 20, 8, 0.35)'
        ctx.beginPath()
        ctx.moveTo(0, y + 30)
        ctx.lineTo(256, y + 30)
        ctx.stroke()
      }
    })
  }
  if (url === 'local:floor-tile') {
    return paintCanvas((ctx) => {
      ctx.fillStyle = '#d8d4cc'
      ctx.fillRect(0, 0, 256, 256)
      ctx.strokeStyle = '#b7b2a8'
      ctx.lineWidth = 3
      for (let i = 0; i <= 256; i += 64) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i, 256)
        ctx.moveTo(0, i)
        ctx.lineTo(256, i)
        ctx.stroke()
      }
    })
  }
  if (url === 'local:floor-stone') {
    return paintCanvas((ctx) => {
      ctx.fillStyle = '#b8b0a4'
      ctx.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(90, 80, 70, ${0.05 + (i % 4) * 0.02})`
        ctx.beginPath()
        ctx.ellipse((i * 47) % 256, (i * 71) % 256, 28, 16, i, 0, Math.PI * 2)
        ctx.fill()
      }
    })
  }
  if (url === 'local:wall-white') {
    return paintCanvas((ctx) => {
      ctx.fillStyle = '#f4f1ea'
      ctx.fillRect(0, 0, 256, 256)
    })
  }
  if (url === 'local:wall-gray') {
    return paintCanvas((ctx) => {
      ctx.fillStyle = '#c8c4be'
      ctx.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 50; i++) {
        ctx.fillStyle = `rgba(90, 88, 84, ${0.03 + (i % 4) * 0.01})`
        ctx.fillRect((i * 41) % 256, (i * 59) % 256, 14, 8)
      }
    })
  }
  if (url === 'local:wall-brick') {
    return paintCanvas((ctx) => {
      ctx.fillStyle = '#8d4b3a'
      ctx.fillRect(0, 0, 256, 256)
      ctx.fillStyle = '#c47a5a'
      for (let row = 0; row < 8; row++) {
        const offset = row % 2 === 0 ? 0 : 32
        for (let col = -1; col < 5; col++) {
          ctx.fillRect(col * 64 + offset + 2, row * 32 + 2, 60, 28)
        }
      }
    })
  }
  if (url.startsWith('local:wall')) {
    return makePlasterWallTexture()
  }
  return makeWoodFloorTexture()
}

export function loadTextureOrFallback(
  url: string | undefined,
  fallback: () => THREE.Texture
): THREE.Texture {
  if (url?.startsWith('local:')) {
    return makeLocalTexture(url)
  }
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

function paintCanvas(paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('canvas 2d unavailable')
  }
  paint(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}
