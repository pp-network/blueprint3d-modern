'use client'

import { Settings, FilePlus, Undo2, Redo2, Download, Upload } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useTranslations } from 'next-intl'
import { useIsMobile } from "@/hooks/use-media-query"

interface TopNavBarProps {
  activeTab: 'projects' | 'edit' | 'items'
  onTabChange: (tab: 'projects' | 'edit' | 'items') => void
  viewMode: '2d' | '3d'
  onViewModeChange: (mode: '2d' | '3d') => void
  onSettingsClick: () => void
  onSave: () => void
  onNew: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  dirty: boolean
  onExport: () => void
  onImport: () => void
  currentBlueprintName?: string | null
}

export function TopNavBar({
  activeTab,
  onTabChange,
  viewMode,
  onViewModeChange,
  onSettingsClick,
  onSave,
  onNew,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  dirty,
  onExport,
  onImport
}: TopNavBarProps) {
  const t = useTranslations('BluePrint.sidebar')
  const tMain = useTranslations('BluePrint.mainControls')
  const isMobile = useIsMobile()

  const tabs = [
    { id: 'projects' as const, label: t('projects') },
    { id: 'edit' as const, label: t('edit') },
    { id: 'items' as const, label: t('addItems') }
  ]

  return (
    <div className={cn('bg-transparent relative pointer-events-none', isMobile ? 'h-12' : 'h-14')}>
      {!(activeTab === 'edit' && viewMode === '2d') && (
        <div className={cn(
          'absolute top-0 flex items-center pointer-events-auto',
          isMobile ? 'left-2 h-12 gap-0.5' : 'left-4 h-14 gap-1'
        )}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'rounded-md font-medium transition-colors',
                isMobile ? 'px-2 py-1.5 text-xs' : 'px-4 py-2 text-sm',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'edit' && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-[100]">
          <div className={cn(
            'flex items-center bg-background/50 backdrop-blur-sm rounded-full border border-border/50',
            isMobile ? 'gap-2 px-3 py-1.5' : 'gap-3 px-4 py-2'
          )}>
            <span className={cn(
              'font-medium transition-colors',
              isMobile ? 'text-xs' : 'text-sm',
              viewMode === '2d' ? 'text-foreground' : 'text-muted-foreground'
            )}>
              2D
            </span>
            <Switch
              checked={viewMode === '3d'}
              onCheckedChange={(checked) => onViewModeChange(checked ? '3d' : '2d')}
              className={cn(isMobile && 'h-4 w-7')}
            />
            <span className={cn(
              'font-medium transition-colors',
              isMobile ? 'text-xs' : 'text-sm',
              viewMode === '3d' ? 'text-foreground' : 'text-muted-foreground'
            )}>
              3D
            </span>
          </div>
        </div>
      )}

      <div className={cn(
        'absolute top-0 flex items-center pointer-events-auto',
        isMobile ? 'right-2 h-12 gap-1' : 'right-4 h-14 gap-2'
      )}>
        {dirty && (
          <span className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
            {tMain('unsaved')}
          </span>
        )}
        <Button
          onClick={onUndo}
          variant="outline"
          size="icon"
          disabled={!canUndo}
          className={cn(isMobile ? 'h-8 w-8' : 'h-9 w-9')}
          aria-label={tMain('undo')}
          title={tMain('undo')}
        >
          <Undo2 className={cn(isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        </Button>
        <Button
          onClick={onRedo}
          variant="outline"
          size="icon"
          disabled={!canRedo}
          className={cn(isMobile ? 'h-8 w-8' : 'h-9 w-9')}
          aria-label={tMain('redo')}
          title={tMain('redo')}
        >
          <Redo2 className={cn(isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        </Button>
        <Button
          onClick={onImport}
          variant="outline"
          size="icon"
          className={cn(isMobile ? 'h-8 w-8' : 'h-9 w-9')}
          aria-label={tMain('importJson')}
          title={tMain('importJson')}
        >
          <Upload className={cn(isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        </Button>
        <Button
          onClick={onExport}
          variant="outline"
          size="icon"
          className={cn(isMobile ? 'h-8 w-8' : 'h-9 w-9')}
          aria-label={tMain('exportJson')}
          title={tMain('exportJson')}
        >
          <Download className={cn(isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        </Button>
        {!(activeTab === 'edit' && viewMode === '2d') && (
          <>
            <Button
              onClick={onNew}
              variant="outline"
              size={isMobile ? 'sm' : 'sm'}
              className={cn(isMobile && 'h-8 px-3 text-xs')}
            >
              <FilePlus className={cn('h-4 w-4', !isMobile && 'mr-1.5')} />
              {!isMobile && tMain('newPlan')}
            </Button>
            <Button
              onClick={onSave}
              variant="default"
              size={isMobile ? 'sm' : 'sm'}
              className={cn(isMobile && 'h-8 px-3 text-xs')}
            >
              {tMain('savePlan')}
            </Button>
            <Button
              onClick={onSettingsClick}
              variant="outline"
              size="icon"
              className={cn(isMobile ? 'h-8 w-8' : 'h-9 w-9')}
              aria-label="Settings"
            >
              <Settings className={cn(isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
