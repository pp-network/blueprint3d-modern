'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const PRESETS = [10, 15, 20]

interface WallThicknessPanelProps {
  thickness: number
  onChange: (cm: number) => void
}

export function WallThicknessPanel({ thickness, onChange }: WallThicknessPanelProps) {
  const t = useTranslations('BluePrint.wallThickness')

  return (
    <div className="w-[220px] rounded-lg border border-border bg-background/95 p-3 shadow-md backdrop-blur-sm">
      <Label className="text-xs text-muted-foreground">{t('title')}</Label>
      <div className="mt-2 flex gap-1">
        {PRESETS.map((cm) => (
          <Button
            key={cm}
            type="button"
            size="sm"
            variant={thickness === cm ? 'default' : 'outline'}
            className="flex-1 text-xs"
            onClick={() => onChange(cm)}
          >
            {cm}
          </Button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="number"
          min={4}
          max={80}
          value={Math.round(thickness)}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (Number.isFinite(next) && next > 0) {
              onChange(next)
            }
          }}
          className="h-8"
        />
        <span className="text-xs text-muted-foreground">cm</span>
      </div>
    </div>
  )
}
