'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TextureSwatch {
  url: string
  name: string
  color: string
  stretch: boolean
  scale: number
}

const FLOOR_SWATCHES: TextureSwatch[] = [
  { url: 'local:floor-wood-light', name: '浅木', color: '#d2b184', stretch: false, scale: 400 },
  { url: 'local:floor-wood-dark', name: '深木', color: '#8b5a2b', stretch: false, scale: 400 },
  { url: 'local:floor-tile', name: '瓷砖', color: '#d8d4cc', stretch: false, scale: 200 },
  { url: 'local:floor-stone', name: '石材', color: '#b8b0a4', stretch: false, scale: 300 }
]

const WALL_SWATCHES: TextureSwatch[] = [
  { url: 'local:wall-plaster', name: '石膏', color: '#efe6d8', stretch: false, scale: 300 },
  { url: 'local:wall-white', name: '白墙', color: '#f4f1ea', stretch: false, scale: 300 },
  { url: 'local:wall-gray', name: '灰墙', color: '#c8c4be', stretch: false, scale: 300 },
  { url: 'local:wall-brick', name: '砖墙', color: '#c47a5a', stretch: false, scale: 100 }
]

interface TextureSelectorProps {
  type: 'floor' | 'wall' | null
  onTextureSelect: (textureUrl: string, stretch: boolean, scale: number) => void
  onClose?: () => void
}

export function TextureSelector({ type, onTextureSelect, onClose }: TextureSelectorProps) {
  const t = useTranslations('BluePrint.textureSelector')

  if (!type) return null

  const textures = type === 'floor' ? FLOOR_SWATCHES : WALL_SWATCHES

  return (
    <div className="pointer-events-auto w-[220px] rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {type === 'floor' ? t('adjustFloor') : t('adjustWall')}
        </h3>
        {onClose && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <p className="mb-2 text-[10px] text-muted-foreground">{t('applyAllHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {textures.map((texture) => (
          <button
            key={texture.url}
            type="button"
            onClick={() => onTextureSelect(texture.url, texture.stretch, texture.scale)}
            className="overflow-hidden rounded-md border-2 border-border transition-all hover:border-primary hover:scale-105 active:scale-95"
          >
            <span className="block aspect-square" style={{ background: texture.color }} />
            <span className="block px-1 py-0.5 text-center text-[10px] text-muted-foreground">
              {texture.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
