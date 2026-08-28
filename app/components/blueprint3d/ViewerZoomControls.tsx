'use client'

import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

interface ViewerZoomControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function ViewerZoomControls({ onZoomIn, onZoomOut, onReset }: ViewerZoomControlsProps) {
  const t = useTranslations('BluePrint.viewer')

  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-md backdrop-blur-sm">
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomIn} title={t('zoomIn')}>
        <Plus className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomOut} title={t('zoomOut')}>
        <Minus className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onReset} title={t('resetView')}>
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  )
}
