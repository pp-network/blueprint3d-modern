'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'

interface OverlayControlsProps {
  hasOverlay: boolean
  hasWalls: boolean
  opacity: number
  locked: boolean
  calibrating: boolean
  calibrateReady: boolean
  onImport: (file: File, overallWidthMm?: number) => void
  onDetect: (overallWidthMm?: number, mode?: 'ai' | 'local') => void
  detecting?: boolean
  aiConfigured?: boolean
  onClear: () => void
  onClearWalls: () => void
  onOpacity: (value: number) => void
  onLocked: (locked: boolean) => void
  onStartCalibrate: () => void
  onApplyCalibrate: (lengthCm: number) => void
  onCancelCalibrate: () => void
  onUndo?: () => void
  canUndo?: boolean
}

export function OverlayControls({
  hasOverlay,
  hasWalls,
  opacity,
  locked,
  calibrating,
  calibrateReady,
  onImport,
  onDetect,
  detecting,
  aiConfigured,
  onClear,
  onClearWalls,
  onOpacity,
  onLocked,
  onStartCalibrate,
  onApplyCalibrate,
  onCancelCalibrate,
  onUndo,
  canUndo
}: OverlayControlsProps) {
  const t = useTranslations('BluePrint.overlay')
  const fileRef = useRef<HTMLInputElement>(null)
  const [length, setLength] = useState('360')
  const [overallMm, setOverallMm] = useState('')

  const parsedOverallMm = Number(overallMm)
  const overall = Number.isFinite(parsedOverallMm) && parsedOverallMm > 0 ? parsedOverallMm : undefined

  return (
    <div className="w-full rounded-lg border border-border bg-background p-3 space-y-3">
      <div className="text-xs font-medium">{t('title')}</div>
      <p className="text-[11px] leading-4 text-muted-foreground">{t('hint')}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onImport(file, overall)
          e.target.value = ''
        }}
      />
      <div className="flex gap-1">
        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => fileRef.current?.click()}>
          {t('import')}
        </Button>
        <Button size="sm" variant="ghost" className="text-xs" disabled={!hasOverlay} onClick={onClear}>
          {t('clear')}
        </Button>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t('overallWidth')}</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={overallMm}
            onChange={(e) => setOverallMm(e.target.value)}
            placeholder="18670"
            className="h-8"
          />
          <span className="text-xs text-muted-foreground">mm</span>
        </div>
      </div>
      {aiConfigured ? (
        <Button
          size="sm"
          className="w-full text-xs"
          disabled={!hasOverlay || detecting}
          onClick={() => onDetect(overall, 'ai')}
        >
          {detecting ? t('detectingShort') : t('detectAi')}
        </Button>
      ) : (
        <p className="text-[11px] leading-4 text-muted-foreground">{t('aiNotConfigured')}</p>
      )}
      <Button
        size="sm"
        variant="outline"
        className="w-full text-xs"
        disabled={!hasOverlay || detecting}
        onClick={() => onDetect(overall, 'local')}
      >
        {detecting ? t('detectingShort') : t('detect')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="w-full text-xs"
        disabled={!hasWalls}
        onClick={onClearWalls}
      >
        {t('clearWalls')}
      </Button>

      {hasOverlay && (
        <>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('opacity')}</Label>
            <Slider
              value={[Math.round(opacity * 100)]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => onOpacity((v[0] ?? 45) / 100)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">{t('lock')}</Label>
            <Switch checked={locked} onCheckedChange={onLocked} />
          </div>
          {!calibrating && (
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={onStartCalibrate}>
              {t('calibrate')}
            </Button>
          )}
          {calibrating && !calibrateReady && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('calibrateHint')}</p>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                disabled={!canUndo}
                onClick={onUndo}
              >
                {t('undoLast')}
              </Button>
            </div>
          )}
          {calibrateReady && (
            <div className="space-y-2">
              <Label className="text-xs">{t('knownLength')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="h-8"
                />
                <span className="text-xs text-muted-foreground">cm</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                disabled={!canUndo}
                onClick={onUndo}
              >
                {t('undoLast')}
              </Button>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => onApplyCalibrate(Number(length))}
                >
                  {t('apply')}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs" onClick={onCancelCalibrate}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
