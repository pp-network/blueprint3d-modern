'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Sofa, Paintbrush, Grid3x3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TopNavBar } from './TopNavBar'
import { ItemsDrawer } from './ItemsDrawer'
import { ProjectsView } from './ProjectsView'
import { SettingsDialog } from './SettingsDialog'
import { ContextMenu } from './ContextMenu'
import { BedSizeInput } from './BedSizeInput'
import { FloorplannerControls } from './FloorplannerControls'
import { TextureSelector } from './TextureSelector'
import { SaveFloorplanDialog } from './SaveFloorplanDialog'
import { TouchHelp } from './TouchHelp'
import { ControlsHelp } from './ControlsHelp'
import { WallThicknessPanel } from './WallThicknessPanel'
import { OverlayControls } from './OverlayControls'
import { AiWallsStreamPanel } from './AiWallsStreamPanel'
import { ViewerZoomControls } from './ViewerZoomControls'
import { FloorplanMinimap, type MinimapItem, type MinimapWall } from './FloorplanMinimap'
import { drawioToSavedFloorplan, isDrawioXml, savedFloorplanToDrawio } from '@blueprint3d/model/floorplan-drawio'
import DefaultFloorplan from '@blueprint3d/templates/default.json'
import blankFloorplan from '@/config/templates/blank.json'
import { blueprintStorage } from '@/services/storage'

import { applyWallTraceToModel } from '@blueprint3d/vision/apply-trace'
import { extractFloorplanPlacements, type FloorplanPlacements } from '@blueprint3d/vision/ai-walls-schema'
import {
  clearAutoPlacedItems,
  hasAutoPlacedOpenings,
  placeDetectedScene,
  punchDetectedOpenings,
  rememberDetectedScene,
  unclosedRoomNames
} from '@blueprint3d/vision/place-findings'
import { formatDoorAccessZh, judgeDoorAccess } from '@blueprint3d/model/door-access'
import { traceWallsFromImage } from '@blueprint3d/vision/trace-walls'
import type { WallTrace } from '@blueprint3d/vision/types'
import { detectWallsWithAi, fetchAiWallsConfigured } from '@/lib/ai-walls'
import { Blueprint3d } from '@blueprint3d/blueprint3d'
import { floorplannerModes } from '@blueprint3d/floorplanner/floorplanner_view'
import { Configuration, configDimUnit } from '@blueprint3d/core/configuration'
import type { Item } from '@blueprint3d/items/item'
import type { HalfEdge } from '@blueprint3d/model/half_edge'
import type { Room } from '@blueprint3d/model/room'
import { Blueprint3DModes, type Blueprint3DMode } from '@blueprint3d/config/modes'
import { RoomType } from '@blueprint3d/types/room_types'

export interface Blueprint3DAppConfig {
  enableWheelZoom?: boolean | (() => boolean)
  mode?: Blueprint3DMode
  onBlueprint3DReady?: (blueprint3d: Blueprint3d) => void
  onBedSizeChange?: (width: number, length: number) => void
  isLanguageOption?: boolean
  openMyFloorplans?: boolean
  isFullscreen?: boolean
  onFullscreenToggle?: () => void
  onViewModeChange?: (mode: '2d' | '3d') => void
  renderOverlay?: () => React.ReactNode
  alwaysSpin?: boolean
}

interface Blueprint3DAppBaseProps {
  config?: Blueprint3DAppConfig
}

export function Blueprint3DAppBase({ config = {} }: Blueprint3DAppBaseProps) {
  const {
    enableWheelZoom = true,
    mode = Blueprint3DModes.BEDROOM,
    onBlueprint3DReady,
    onBedSizeChange,
    isLanguageOption = false,
    openMyFloorplans = false,
    isFullscreen = false,
    onViewModeChange,
    renderOverlay,
    alwaysSpin = false
  } = config

  const t = useTranslations('BluePrint.saveDialog')
  const tItems = useTranslations('BluePrint.items')
  const tFloorplanner = useTranslations('BluePrint.floorplanner')
  const tMyFloorplans = useTranslations('BluePrint.myFloorplans')
  const tMain = useTranslations('BluePrint.mainControls')
  const tHowTo = useTranslations('BluePrint.howTo')
  const tOverlay = useTranslations('BluePrint.overlay')
  const tTexture = useTranslations('BluePrint.textureSelector')

  const PLACEMENTS_KEY = 'bp3d.lastPlacements'

  const contentRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const floorplannerCanvasRef = useRef<HTMLCanvasElement>(null)
  const floorplannerStageRef = useRef<HTMLDivElement>(null)
  const blueprint3dRef = useRef<Blueprint3d | null>(null)
  const loadingToastsRef = useRef<Array<{ toastId: string | number; itemName: string }>>([])

  const [activeTab, setActiveTab] = useState<'projects' | 'edit' | 'items'>(
    openMyFloorplans ? 'projects' : 'edit'
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [floorplannerMode, setFloorplannerMode] = useState<'move' | 'draw' | 'drawDoor' | 'delete'>('move')
  const [textureType, setTextureType] = useState<'floor' | 'wall' | null>(null)
  const [currentTarget, setCurrentTarget] = useState<HalfEdge | Room | null>(null)
  const [itemsLoading, setItemsLoading] = useState(0)
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [selectedWallThickness, setSelectedWallThickness] = useState<number | null>(null)
  const [overlayState, setOverlayState] = useState({
    hasOverlay: false,
    opacity: 0.45,
    locked: true,
    compare: true,
    calibrating: false,
    calibrateReady: false
  })
  const [hasWalls, setHasWalls] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [aiConfigured, setAiConfigured] = useState(false)
  const [aiModel, setAiModel] = useState<string | null>(null)
  const [aiStream, setAiStream] = useState({ thinking: '', output: '', status: '', findings: '' })
  const [tourRooms, setTourRooms] = useState<Room[]>([])
  const [minimapWalls, setMinimapWalls] = useState<MinimapWall[]>([])
  const [minimapItems, setMinimapItems] = useState<MinimapItem[]>([])
  const [activeRoomName, setActiveRoomName] = useState<string>()
  const [generatingFurnishings, setGeneratingFurnishings] = useState(false)
  const lastPlacementsRef = useRef<FloorplanPlacements | null>(null)
  const openingsPlacedRef = useRef(false)
  const detectGenerationRef = useRef(0)
  const detectAbortRef = useRef<AbortController | null>(null)
  const detectSnapshotRef = useRef<string | null>(null)

  const [currentBlueprint, setCurrentBlueprint] = useState<{
    id: string
    name: string
    roomType: RoomType
  } | null>(null)
  const currentBlueprintRef = useRef(currentBlueprint)
  currentBlueprintRef.current = currentBlueprint
  const seedingRef = useRef(false)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jsonInputRef = useRef<HTMLInputElement>(null)

  const [currentMode, setCurrentMode] = useState<Blueprint3DMode>(mode)

  const getWheelZoomEnabled = useCallback(() => {
    if (typeof enableWheelZoom === 'function') {
      return enableWheelZoom()
    }
    return enableWheelZoom
  }, [enableWheelZoom])

  useEffect(() => {
    void fetchAiWallsConfigured().then((status) => {
      setAiConfigured(status.configured)
      setAiModel(status.model)
    })
  }, [])

  // Initialize Blueprint3d
  useEffect(() => {
    if (!viewerRef.current || blueprint3dRef.current) return

    const savedUnit = localStorage.getItem('dimensionUnit')
    if (savedUnit) {
      Configuration.setValue(configDimUnit, savedUnit)
    }

    const opts = {
      floorplannerElement: 'floorplanner-canvas',
      threeElement: '#viewer',
      textureDir: '/models/textures/',
      widget: false,
      enableWheelZoom: getWheelZoomEnabled(),
      alwaysSpin
    }

    const blueprint3d = new Blueprint3d(opts)
    blueprint3dRef.current = blueprint3d

    if (onBlueprint3DReady) {
      onBlueprint3DReady(blueprint3d)
    }

    blueprint3d.three.itemSelectedCallbacks.add((item) => {
      setSelectedItem(item)
      setTextureType(null)
    })

    blueprint3d.three.itemUnselectedCallbacks.add(() => {
      setSelectedItem(null)
    })

    blueprint3d.three.wallClicked.add((halfEdge) => {
      setCurrentTarget(halfEdge)
      setTextureType('wall')
      setSelectedItem(null)
    })

    blueprint3d.three.floorClicked.add((room) => {
      setCurrentTarget(room)
      setTextureType('floor')
      setSelectedItem(null)
    })

    blueprint3d.three.nothingClicked.add(() => {
      setTextureType(null)
      setCurrentTarget(null)
    })

    const syncHistoryUi = () => {
      setCanUndo(blueprint3d.floorplanner?.canUndoLastChange ?? blueprint3d.model.history.canUndo)
      setCanRedo(blueprint3d.model.history.canRedo)
      if (!seedingRef.current) {
        setDirty(true)
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = setTimeout(() => {
          const bp = blueprint3dRef.current
          const current = currentBlueprintRef.current
          if (!bp) return
          try {
            const data = JSON.parse(bp.model.exportSerialized())
            if (current && current.id !== blueprintStorage.DRAFT_ID) {
              void blueprintStorage.update(current.id, {
                name: current.name,
                layoutData: data,
                roomType: current.roomType
              })
            } else {
              void blueprintStorage.saveDraft({
                name: current?.name || 'Draft',
                layoutData: data,
                roomType: current?.roomType
              })
            }
            setDirty(false)
          } catch (error) {
            console.error('Autosave failed:', error)
          }
        }, 2000)
      }
    }
    const snapshotTour = () => {
      const fp = blueprint3d.model.floorplan
      setTourRooms([...fp.getRooms()])
      setMinimapWalls(
        fp.getWalls().map((wall) => ({
          x1: wall.getStart().x,
          y1: wall.getStart().y,
          x2: wall.getEnd().x,
          y2: wall.getEnd().y,
          opening: wall.opening
        }))
      )
      setMinimapItems(
        blueprint3d.model.scene.getItems().map((item) => ({
          x: item.position.x,
          z: item.position.z
        }))
      )
    }
    snapshotTour()

    blueprint3d.model.historyChanged.add(() => {
      syncHistoryUi()
      setHasWalls(blueprint3d.model.floorplan.getWalls().length > 0)
      snapshotTour()
    })
    blueprint3d.model.floorplan.fireOnUpdatedRooms(() => {
      snapshotTour()
    })

    try {
      const raw = sessionStorage.getItem(PLACEMENTS_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as {
          placements?: FloorplanPlacements
          transform?: { originX: number; originY: number; cmPerImagePixel: number }
        }
        if (stored.placements) {
          lastPlacementsRef.current = stored.placements
          rememberDetectedScene(
            blueprint3d.model,
            stored.transform ?? blueprint3d.floorplanner?.overlay ?? null,
            stored.placements
          )
        }
      }
    } catch {
      /* ignore */
    }

    blueprint3d.floorplanner?.wallSelectedCallbacks.add((wall) => {
      setSelectedWallThickness(wall ? wall.thickness : null)
    })
    blueprint3d.floorplanner?.overlayChanged.add(() => {
      const overlay = blueprint3d.floorplanner?.overlay
      setOverlayState((prev) => ({
        ...prev,
        hasOverlay: Boolean(overlay),
        opacity: overlay?.opacity ?? 0.45,
        locked: overlay?.locked ?? true
      }))
      setCanUndo(blueprint3d.floorplanner?.canUndoLastChange ?? blueprint3d.model.history.canUndo)
    })
    blueprint3d.floorplanner?.calibrateReady.add(() => {
      setOverlayState((prev) => ({ ...prev, calibrateReady: true, calibrating: true }))
    })
    blueprint3d.floorplanner?.calibrateChanged.add((state) => {
      setOverlayState((prev) => ({
        ...prev,
        calibrating: state.calibrating,
        calibrateReady: state.ready
      }))
      setCanUndo(blueprint3d.floorplanner?.canUndoLastChange ?? false)
    })

    blueprint3d.model.scene.itemLoadingCallbacks.add(() => {
      setItemsLoading((prev) => prev + 1)
    })

    blueprint3d.model.scene.itemLoadedCallbacks.add((item) => {
      setItemsLoading((prev) => prev - 1)
      snapshotTour()
      const loadingToasts = loadingToastsRef.current
      if (loadingToasts.length > 0) {
        const { toastId, itemName } = loadingToasts.shift()!
        toast.success(tItems('loadedSuccess', { name: itemName }), { id: toastId })
      }
    })

    blueprint3d.model.scene.itemLoadErrorCallbacks.add(() => {
      setItemsLoading((prev) => prev - 1)
      const loadingToasts = loadingToastsRef.current
      if (loadingToasts.length > 0) {
        const { toastId, itemName } = loadingToasts.shift()!
        toast.error(tItems('loadError', { name: itemName }), { id: toastId })
      }
    })

    // Load floorplan from IndexedDB or use default
    const loadInitialFloorplan = async () => {
      seedingRef.current = true
      try {
        const draft = await blueprintStorage.getDraft()
        if (draft?.layoutData) {
          blueprint3d.model.loadSerialized(JSON.stringify(draft.layoutData))
          setCurrentBlueprint({
            id: draft.id,
            name: draft.name,
            roomType: draft.roomType || RoomType.BEDROOM
          })
          return
        }

        const { blueprintTemplateDB } = await import('@blueprint3d/indexdb/blueprint-template')
        const savedTemplate = await blueprintTemplateDB.getTemplate()

        if (savedTemplate) {
          blueprint3d.model.loadSerialized(JSON.stringify(savedTemplate))
          return
        }

        const { getModeConfig } = await import('@blueprint3d/config/modes')
        const modeConfig = getModeConfig(mode)
        blueprint3d.model.loadSerialized(JSON.stringify(modeConfig.defaultTemplate))
      } catch (error) {
        console.error('[Blueprint3DAppBase] Error loading template:', error)
        blueprint3d.model.loadSerialized(JSON.stringify(DefaultFloorplan))
      } finally {
        seedingRef.current = false
        setCanUndo(blueprint3d.model.history.canUndo)
        setCanRedo(blueprint3d.model.history.canRedo)
        setDirty(false)
      }
    }

    loadInitialFloorplan()

    return () => {
      // Cleanup if needed
    }
  }, [getWheelZoomEnabled, tItems, mode, onBlueprint3DReady])

  // Update wheel zoom setting when it changes
  useEffect(() => {
    if (blueprint3dRef.current) {
      blueprint3dRef.current.three.controls.enableWheelZoom = getWheelZoomEnabled()
    }
  }, [getWheelZoomEnabled])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (blueprint3dRef.current && activeTab === 'edit') {
        if (viewMode === '3d') {
          blueprint3dRef.current.three.updateWindowSize()
        } else {
          blueprint3dRef.current.floorplanner?.resizeView()
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeTab, viewMode])

  // Handle resize with ResizeObserver for accurate sizing
  useEffect(() => {
    if (!contentRef.current || !blueprint3dRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      if (!blueprint3dRef.current || activeTab !== 'edit') return
      if (viewMode === '3d') {
        blueprint3dRef.current.three.updateWindowSize()
      } else {
        blueprint3dRef.current.floorplanner?.resizeView()
      }
    })

    resizeObserver.observe(contentRef.current)
    if (floorplannerStageRef.current) {
      resizeObserver.observe(floorplannerStageRef.current)
    }
    return () => resizeObserver.disconnect()
  }, [activeTab, viewMode, detecting])

  const placeOpeningsOn3d = useCallback(() => {
    const app = blueprint3dRef.current
    if (!app || openingsPlacedRef.current || hasAutoPlacedOpenings(app.model)) return
    const overlay = app.floorplanner?.overlay ?? null
    const placements =
      lastPlacementsRef.current ??
      app.model.floorplan.detectedPlacements ??
      extractFloorplanPlacements(aiStream.output)
    if (!placements?.openings.length) return
    const placed = placeDetectedScene(app.model, overlay, placements, { furniture: false })
    if (placed.doors + placed.windows > 0) {
      openingsPlacedRef.current = true
      toast.success(tOverlay('openingsOn3d', { doors: placed.doors, windows: placed.windows }))
    }
  }, [aiStream.output, tOverlay])

  const handleViewChange = useCallback(
    (mode: '2d' | '3d') => {
      if (!blueprint3dRef.current) return
      blueprint3dRef.current.three.setViewMode(mode)
      setViewMode(mode)
      onViewModeChange?.(mode)

      if (mode === '2d') {
        setTimeout(() => {
          const planner = blueprint3dRef.current?.floorplanner
          if (!planner) {
            return
          }
          planner.resizeView()
          if (planner.overlay) {
            planner.frameOnOverlay()
          } else {
            planner.resetOrigin()
          }
        }, 50)
      } else {
        setTimeout(() => {
          if (blueprint3dRef.current) {
            blueprint3dRef.current.model.floorplan.update()
            blueprint3dRef.current.three.updateWindowSize()
            placeOpeningsOn3d()
          }
        }, 50)
      }
    },
    [onViewModeChange, placeOpeningsOn3d]
  )

  const handleDeleteItem = useCallback(() => {
    if (selectedItem && blueprint3dRef.current) {
      blueprint3dRef.current.model.beginHistory()
      selectedItem.removeFromScene()
      blueprint3dRef.current.model.commitHistory()
      setSelectedItem(null)
    }
  }, [selectedItem])

  const handleResizeItem = useCallback(
    (height: number, width: number, depth: number) => {
      if (selectedItem && blueprint3dRef.current) {
        blueprint3dRef.current.model.beginHistory()
        selectedItem.resize(height, width, depth)
        blueprint3dRef.current.model.commitHistory()
      }
    },
    [selectedItem]
  )

  const handleFixedChange = useCallback(
    (fixed: boolean) => {
      if (selectedItem && blueprint3dRef.current) {
        blueprint3dRef.current.model.beginHistory()
        selectedItem.setFixed(fixed)
        blueprint3dRef.current.model.commitHistory()
      }
    },
    [selectedItem]
  )

  const handleRotateItem = useCallback(
    (radians: number) => {
      if (selectedItem && blueprint3dRef.current) {
        blueprint3dRef.current.model.beginHistory()
        selectedItem.rotation.y += radians
        blueprint3dRef.current.model.commitHistory()
        blueprint3dRef.current.model.scene.needsUpdate = true
        blueprint3dRef.current.three.refreshHud()
      }
    },
    [selectedItem]
  )

  const handleGoToRoom = useCallback((room: Room) => {
    const app = blueprint3dRef.current
    if (!app) return
    setViewMode('3d')
    app.three.setViewMode('3d')
    app.three.goToRoom(room)
    setActiveRoomName(room.name)
    placeOpeningsOn3d()
  }, [placeOpeningsOn3d])

  const handleGenerateFurnishings = useCallback(() => {
    const app = blueprint3dRef.current
    if (!app) return
    if (app.model.floorplan.getWalls().length === 0) {
      toast.error(tOverlay('generateNeedWalls'))
      return
    }
    setGeneratingFurnishings(true)
    try {
      clearAutoPlacedItems(app.model)
      const overlay = app.floorplanner?.overlay ?? null
      const placements =
        lastPlacementsRef.current ??
        app.model.floorplan.detectedPlacements ??
        extractFloorplanPlacements(aiStream.output)
      if (!placements || (!placements.furniture.length && !placements.openings.length && !placements.rooms.length)) {
        toast.error(tOverlay('generateNeedFindings'))
        return
      }
      const placed = placeDetectedScene(app.model, overlay, placements)
      if (placed.doors + placed.windows > 0) openingsPlacedRef.current = true
      if (placed.furniture + placed.doors + placed.windows === 0) {
        toast.error(tOverlay('generateNeedFindings'))
        return
      }
      setTourRooms([...app.model.floorplan.getRooms()])
      toast.success(
        tOverlay('generateSuccess', {
          furniture: placed.furniture,
          doors: placed.doors,
          windows: placed.windows
        })
      )
    } catch (error) {
      console.error('Generate furnishings failed:', error)
      toast.error(tOverlay('generateError'))
    } finally {
      setGeneratingFurnishings(false)
    }
  }, [aiStream.output, tOverlay])

  const handleZoomIn = useCallback(() => {
    blueprint3dRef.current?.three.zoomIn()
  }, [])

  const handleZoomOut = useCallback(() => {
    blueprint3dRef.current?.three.zoomOut()
  }, [])

  const handleResetView = useCallback(() => {
    blueprint3dRef.current?.three.centerCamera()
  }, [])

  const handleUndo = useCallback(() => {
    seedingRef.current = false
    const app = blueprint3dRef.current
    if (!app) return
    if (app.floorplanner) {
      app.floorplanner.undoLastChange()
    } else {
      app.model.undo()
    }
    setCanUndo(app.floorplanner?.canUndoLastChange ?? app.model.history.canUndo)
    setCanRedo(app.model.history.canRedo)
    setSelectedItem(null)
    setSelectedWallThickness(null)
  }, [])

  const handleRedo = useCallback(() => {
    seedingRef.current = false
    const app = blueprint3dRef.current
    if (!app) return
    if (app.floorplanner) {
      app.floorplanner.redoLastChange()
    } else {
      app.model.redo()
    }
    setCanUndo(app.floorplanner?.canUndoLastChange ?? app.model.history.canUndo)
    setCanRedo(app.model.history.canRedo)
    setSelectedItem(null)
    setSelectedWallThickness(null)
  }, [])

  const handleExportJson = useCallback(() => {
    if (!blueprint3dRef.current) return
    const name = currentBlueprintRef.current?.name || 'floorplan'
    const xml = savedFloorplanToDrawio(blueprint3dRef.current.model.floorplan.saveFloorplan(), name)
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.drawio`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(tMain('exportSuccess'))
  }, [tMain])

  const handleImportJson = useCallback(() => {
    jsonInputRef.current?.click()
  }, [])

  const handleJsonFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = String(reader.result)
          if (!blueprint3dRef.current) return
          seedingRef.current = true
          if (isDrawioXml(text)) {
            const floorplan = drawioToSavedFloorplan(text)
            blueprint3dRef.current.model.loadSerialized(JSON.stringify({ floorplan, items: [] }))
          } else {
            const parsed = JSON.parse(text) as { floorplan?: unknown; items?: unknown }
            if (!parsed.floorplan || !parsed.items) {
              throw new Error('invalid')
            }
            blueprint3dRef.current.model.loadSerialized(text)
          }
          seedingRef.current = false
          setHasWalls(blueprint3dRef.current.model.floorplan.getWalls().length > 0)
          setDirty(true)
          toast.success(tMain('importSuccess'))
        } catch (error) {
          console.error('Import failed:', error)
          toast.error(tMain('importError'))
        }
      }
      reader.readAsText(file)
    },
    [tMain]
  )

  const handleWallThickness = useCallback((cm: number) => {
    blueprint3dRef.current?.floorplanner?.setWallThickness(cm)
    setSelectedWallThickness(cm)
  }, [])

  const cancelWallDetect = useCallback((restoreWalls = false) => {
    detectGenerationRef.current += 1
    detectAbortRef.current?.abort()
    detectAbortRef.current = null
    setDetecting(false)
    const snapshot = detectSnapshotRef.current
    detectSnapshotRef.current = null
    if (restoreWalls && snapshot && blueprint3dRef.current) {
      blueprint3dRef.current.model.loadSerialized(snapshot, { seedHistory: false })
    }
  }, [])

  const runWallDetect = useCallback(
    (overallWidthMm?: number, mode: 'ai' | 'local' = 'local') => {
      const app = blueprint3dRef.current
      const overlay = app?.floorplanner?.overlay
      if (!app?.floorplanner || !overlay) {
        toast.error(tOverlay('detectError'))
        return
      }
      if (app.model.floorplan.getWalls().length > 0 && !window.confirm(tOverlay('detectReplaceConfirm'))) {
        return
      }
      cancelWallDetect(false)
      detectSnapshotRef.current = app.model.exportSerialized()
      const generation = detectGenerationRef.current
      const abort = new AbortController()
      detectAbortRef.current = abort
      setDetecting(true)
      openingsPlacedRef.current = false
      setAiStream({ thinking: '', output: '', status: '', findings: '' })
      const toastId = toast.loading(tOverlay('detecting'))
      const run = async () => {
        try {
          const overallCm = overallWidthMm && overallWidthMm > 0 ? overallWidthMm / 10 : undefined
          let lastApply = 0
          let framed = false
          const paint = (trace: WallTrace, seedHistory: boolean) => {
            if (generation !== detectGenerationRef.current) return 0
            app.floorplanner!.lastWallTrace = trace
            const count = applyWallTraceToModel(app.model, overlay, trace, overallCm, { seedHistory })
            if (!framed) {
              app.floorplanner!.frameOnOverlay()
              framed = true
            }
            setHasWalls(count > 0)
            return count
          }
          let fallback: WallTrace | null = null
          try {
            let placements: FloorplanPlacements | null = null
            let dumpPath: string | undefined
            const trace =
              mode === 'ai'
                ? await (async () => {
                    const result = await detectWallsWithAi(
                    overlay.image,
                    overallWidthMm,
                    (partial, progress) => {
                      if (generation !== detectGenerationRef.current) return
                      toast.loading(tOverlay('detectingPartial', progress), { id: toastId })
                      const now = Date.now()
                      if (now - lastApply >= 180) {
                        lastApply = now
                        paint(partial, false)
                      }
                    },
                    (stream) => {
                      if (generation !== detectGenerationRef.current) return
                      if (stream.placements) lastPlacementsRef.current = stream.placements
                      setAiStream((prev) => ({
                        thinking: stream.thinking ?? prev.thinking,
                        output: stream.output ?? prev.output,
                        status: stream.status ?? prev.status,
                        findings: stream.findings ?? prev.findings
                      }))
                    },
                    abort.signal
                    )
                    placements = result.placements ?? lastPlacementsRef.current
                    dumpPath = result.dumpPath
                    return result.trace
                  })()
                : traceWallsFromImage(overlay.image)
            if (generation !== detectGenerationRef.current) {
              toast.dismiss(toastId)
              return
            }
            if (trace.segments.length === 0) {
              toast.error(tOverlay('detectEmpty'), { id: toastId })
              return
            }
            const count = paint(trace, true)
            lastPlacementsRef.current = placements ?? lastPlacementsRef.current
            rememberDetectedScene(app.model, overlay, lastPlacementsRef.current)
            const punched = punchDetectedOpenings(app.model)
            const unclosed = unclosedRoomNames(app.model.floorplan)
            const access = judgeDoorAccess(app.model.floorplan)
            const notes = [
              punched > 0 ? `已在墙上切开 ${punched} 个门洞` : '',
              unclosed.length ? `未封闭：${unclosed.join('、')}。对照底图补墙，不要凭空闭圈` : '',
              formatDoorAccessZh(access)
            ].filter(Boolean)
            if (notes.length) {
              setAiStream((prev) => ({
                ...prev,
                findings: [prev.findings, ...notes].filter(Boolean).join('\n')
              }))
            }
            if (lastPlacementsRef.current) {
              try {
                sessionStorage.setItem(
                  PLACEMENTS_KEY,
                  JSON.stringify({
                    placements: lastPlacementsRef.current,
                    transform: {
                      originX: overlay.originX,
                      originY: overlay.originY,
                      cmPerImagePixel: overlay.cmPerImagePixel
                    }
                  })
                )
              } catch {
                /* ignore */
              }
            }
            setTourRooms([...app.model.floorplan.getRooms()])
            app.floorplanner!.frameOnOverlay()
            setViewMode('2d')
            app.three.setViewMode('2d')
            if (dumpPath) {
              setAiStream((prev) => ({
                ...prev,
                findings: prev.findings
                  ? `${prev.findings}\n${tOverlay('detectDump', { path: dumpPath })}`
                  : tOverlay('detectDump', { path: dumpPath })
              }))
            }
            toast.success(
              dumpPath
                ? `${tOverlay('detectSuccess', { count })} ${tOverlay('detectDump', { path: dumpPath })}`
                : tOverlay('detectSuccess', { count }),
              { id: toastId }
            )
          } catch (error) {
            if (mode === 'ai') {
              fallback = traceWallsFromImage(overlay.image)
              if (fallback.segments.length > 0) {
                const count = paint(fallback, false)
                app.model.floorplan.relabelRooms()
                setViewMode('2d')
                toast.warning(tOverlay('detectFallback', { count }), { id: toastId })
                return
              }
            }
            throw error
          }
        } catch (error) {
          if (generation !== detectGenerationRef.current || abort.signal.aborted) {
            toast.dismiss(toastId)
            return
          }
          console.error('Wall detect failed:', error)
          const message = error instanceof Error ? error.message : tOverlay('detectError')
          toast.error(message, { id: toastId })
        } finally {
          if (generation === detectGenerationRef.current) {
            setDetecting(false)
            detectAbortRef.current = null
            detectSnapshotRef.current = null
          }
        }
      }
      void run()
    },
    [cancelWallDetect, tOverlay]
  )

  const forgetDetectedMarkers = useCallback(() => {
    lastPlacementsRef.current = null
    openingsPlacedRef.current = false
    if (blueprint3dRef.current) {
      blueprint3dRef.current.model.floorplan.detectedPlacements = null
    }
    try {
      sessionStorage.removeItem(PLACEMENTS_KEY)
    } catch {
      /* ignore */
    }
  }, [PLACEMENTS_KEY])

  const handleOverlayImport = useCallback((file: File, overallWidthMm?: number) => {
    const looksLikeImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name)
    if (!looksLikeImage) {
      toast.error(tOverlay('importError'))
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const app = blueprint3dRef.current
      if (!app?.floorplanner) {
        URL.revokeObjectURL(url)
        toast.error(tOverlay('importError'))
        return
      }
      app.three.setViewMode('2d')
      setViewMode('2d')
      cancelWallDetect(true)
      forgetDetectedMarkers()
      toast.dismiss()
      app.floorplanner.setOverlayImage(image, {
        overallWidthCm: overallWidthMm && overallWidthMm > 0 ? overallWidthMm / 10 : undefined
      })
      setOverlayState((prev) => ({
        ...prev,
        hasOverlay: true,
        calibrating: false,
        calibrateReady: false
      }))
      URL.revokeObjectURL(url)
      const wallCount = app.model.floorplan.getWalls().length
      toast.success(wallCount > 0 ? tOverlay('importKeepWalls') : tOverlay('importSuccess'))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error(tOverlay('importError'))
    }
    image.src = url
  }, [cancelWallDetect, forgetDetectedMarkers, tOverlay])

  const handleClearWalls = useCallback(() => {
    const app = blueprint3dRef.current
    if (!app) {
      return
    }
    app.model.loadSerialized(JSON.stringify(blankFloorplan), { seedHistory: true })
    app.floorplanner?.frameOnOverlay()
    setHasWalls(false)
    setSelectedWallThickness(null)
    toast.success(tOverlay('clearWallsSuccess'))
  }, [tOverlay])

  // Generate top-down thumbnail
  const generateTopDownThumbnail = useCallback((): string => {
    if (!blueprint3dRef.current) return ''

    const three = blueprint3dRef.current.three
    const camera = three.camera
    const controls = three.controls
    const renderer = three.renderer

    const savedPosition = camera.position.clone()
    const savedTarget = controls.target.clone()
    const savedRotation = camera.rotation.clone()
    const savedAspect = camera.aspect

    const currentCanvas = renderer.domElement
    const savedWidth = currentCanvas.width
    const savedHeight = currentCanvas.height

    const targetWidth = 1800
    const targetHeight = 1200

    try {
      renderer.setSize(targetWidth, targetHeight, false)
      camera.aspect = targetWidth / targetHeight
      camera.updateProjectionMatrix()

      const center = blueprint3dRef.current.model.floorplan.getCenter()
      const size = blueprint3dRef.current.model.floorplan.getSize()

      const targetAspect = 3 / 2
      const roomAspect = size.x / size.z
      const margin = 1.4

      let viewWidth: number, viewHeight: number
      if (roomAspect > targetAspect) {
        viewWidth = size.x * margin
        viewHeight = viewWidth / targetAspect
      } else {
        viewHeight = size.z * margin
        viewWidth = viewHeight * targetAspect
      }

      const fov = camera.fov * (Math.PI / 180)
      const distance = Math.max(viewWidth, viewHeight) / (2 * Math.tan(fov / 2))

      controls.target.set(center.x, 0, center.z)
      camera.position.set(center.x, distance, center.z)
      camera.lookAt(controls.target)
      camera.updateProjectionMatrix()
      controls.update()

      renderer.clear()
      renderer.render(three.scene.getScene(), camera)

      return currentCanvas.toDataURL('image/webp', 0.85)
    } finally {
      renderer.setSize(savedWidth, savedHeight, false)
      camera.aspect = savedAspect
      camera.position.copy(savedPosition)
      controls.target.copy(savedTarget)
      camera.rotation.copy(savedRotation)
      camera.updateProjectionMatrix()
      controls.update()

      renderer.clear()
      renderer.render(three.scene.getScene(), camera)
    }
  }, [])

  // Save: update existing or show dialog
  const handleSave = useCallback(async () => {
    if (currentBlueprint) {
      if (!blueprint3dRef.current) return
      const toastId = toast.loading(t('saving') || 'Saving floorplan...')
      try {
        const data = blueprint3dRef.current.model.exportSerialized()
        const thumbnail = generateTopDownThumbnail()
        const layoutData = JSON.parse(data)
        await blueprintStorage.update(currentBlueprint.id, {
          name: currentBlueprint.name,
          layoutData,
          thumbnailBase64: thumbnail,
          roomType: currentBlueprint.roomType
        })
        toast.success(t('saveSuccess'), { id: toastId })
        setDirty(false)
      } catch (error) {
        console.error('Failed to update floorplan:', error)
        toast.error(t('saveError'), { id: toastId })
      }
    } else {
      setSaveDialogOpen(true)
    }
  }, [currentBlueprint, generateTopDownThumbnail, t])

  const handleNew = useCallback(() => {
    setSaveDialogOpen(true)
  }, [])

  // Create new blueprint via dialog
  const handleSaveFloorplan = useCallback(
    async (name: string, roomType: RoomType) => {
      if (!blueprint3dRef.current) return
      const toastId = toast.loading(t('saving') || 'Saving floorplan...')
      try {
        const data = blueprint3dRef.current.model.exportSerialized()
        const thumbnail = generateTopDownThumbnail()
        const layoutData = JSON.parse(data)
        const result = await blueprintStorage.create({
          name,
          layoutData,
          thumbnailBase64: thumbnail,
          roomType
        })
        setCurrentBlueprint({ id: result.id, name, roomType })
        toast.success(t('saveSuccess'), { id: toastId })
        setDirty(false)
      } catch (error) {
        console.error('Failed to save floorplan:', error)
        toast.error(t('saveError'), { id: toastId })
      }
    },
    [generateTopDownThumbnail, t]
  )

  // Load from saved floorplan
  const handleLoadFloorplan = useCallback(
    (data: string, loadedMode?: RoomType, blueprintId?: string, blueprintName?: string) => {
      if (!blueprint3dRef.current) return
      seedingRef.current = true
      blueprint3dRef.current.model.loadSerialized(data)
      seedingRef.current = false
      setDirty(false)
      setCanUndo(false)
      setCanRedo(false)
      if (loadedMode) setCurrentMode(loadedMode as Blueprint3DMode)
      if (blueprintId && blueprintName) {
        setCurrentBlueprint({
          id: blueprintId,
          name: blueprintName,
          roomType: loadedMode || RoomType.BEDROOM
        })
      }
      setActiveTab('edit')
    },
    []
  )

  const handleUnitChange = useCallback(
    (unit: string) => {
      Configuration.setValue(configDimUnit, unit)
      if (blueprint3dRef.current && activeTab === 'edit' && viewMode === '2d') {
        blueprint3dRef.current.floorplanner?.reset()
      }
    },
    [activeTab, viewMode]
  )

  const handleTabChange = useCallback(
    (tab: 'projects' | 'edit' | 'items') => {
      setActiveTab(tab)
      setTextureType(null)

      if (blueprint3dRef.current && tab === 'edit') {
        blueprint3dRef.current.three.stopSpin()
        blueprint3dRef.current.three.getController().setSelectedObject(null)

        if (viewMode === '2d') {
          const canvas = floorplannerCanvasRef.current
          if (canvas) {
            const resizeObserver = new ResizeObserver(() => {
              if (blueprint3dRef.current && canvas.clientWidth > 0) {
                blueprint3dRef.current.floorplanner?.reset()
                blueprint3dRef.current.floorplanner?.resetOrigin()
                resizeObserver.disconnect()
              }
            })
            resizeObserver.observe(canvas)
          }
        } else {
          blueprint3dRef.current.model.floorplan.update()
          setTimeout(() => {
            if (blueprint3dRef.current) {
              blueprint3dRef.current.three.updateWindowSize()
            }
          }, 100)
        }
      }
    },
    [viewMode]
  )

  const handleFloorplannerModeChange = useCallback((mode: 'move' | 'draw' | 'drawDoor' | 'delete') => {
    setFloorplannerMode(mode)
    if (!blueprint3dRef.current) return
    const modeMap = {
      move: floorplannerModes.MOVE,
      draw: floorplannerModes.DRAW,
      drawDoor: floorplannerModes.DRAW_DOOR,
      delete: floorplannerModes.DELETE
    }
    blueprint3dRef.current.floorplanner?.setMode(modeMap[mode])
  }, [])

  const handleFloorplannerDone = useCallback(() => {
    setViewMode('3d')
    if (blueprint3dRef.current) {
      blueprint3dRef.current.three.setViewMode('3d')
      blueprint3dRef.current.model.floorplan.update()
      placeOpeningsOn3d()
    }
  }, [placeOpeningsOn3d])

  const handleItemSelect = useCallback(
    (item: {
      name: string
      key: string
      model: string
      type: string
      description?: string
    }) => {
      if (!blueprint3dRef.current) return
      const translatedName = tItems(item.key)
      const toastId = toast.loading(tItems('loadingItem', { name: translatedName }))
      loadingToastsRef.current.push({ toastId, itemName: translatedName })

      const metadata = {
        itemName: item.name,
        itemKey: item.key,
        resizable: true,
        modelUrl: item.model,
        itemType: parseInt(item.type),
        description: item.description
      }

      blueprint3dRef.current.model.beginHistory()
      blueprint3dRef.current.model.scene.addItem(parseInt(item.type), item.model, metadata)
      const commitOnce = (_item: Item) => {
        blueprint3dRef.current?.model.commitHistory()
        blueprint3dRef.current?.model.scene.itemLoadedCallbacks.remove(commitOnce)
      }
      blueprint3dRef.current.model.scene.itemLoadedCallbacks.add(commitOnce)
      setActiveTab('edit')
      setViewMode('3d')
    },
    [tItems]
  )

  const handleTextureSelect = useCallback(
    (textureUrl: string, stretch: boolean, scale: number) => {
      const app = blueprint3dRef.current
      if (!app || !textureType) return
      app.model.beginHistory()
      if (textureType === 'wall') {
        for (const wall of app.model.floorplan.getWalls()) {
          wall.frontTexture = { url: textureUrl, stretch, scale }
          wall.backTexture = { url: textureUrl, stretch, scale }
          wall.frontEdge?.setTexture(textureUrl, stretch, scale)
          wall.backEdge?.setTexture(textureUrl, stretch, scale)
        }
      } else {
        for (const room of app.model.floorplan.getRooms()) {
          room.setTexture(textureUrl, stretch, scale)
        }
      }
      app.model.commitHistory()
      app.three.needsUpdate()
    },
    [textureType]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  return (
    <div className="relative h-full w-full">
      {/* Top Navigation Bar */}
      {!isFullscreen && (
        <div className="absolute top-0 left-0 right-0 z-50">
          <TopNavBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            viewMode={viewMode}
            onViewModeChange={handleViewChange}
            onSettingsClick={() => setSettingsOpen(true)}
            onSave={handleSave}
            onNew={handleNew}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            dirty={dirty}
            onExport={handleExportJson}
            onImport={handleImportJson}
            currentBlueprintName={currentBlueprint?.name}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div ref={contentRef} className="h-full w-full relative overflow-hidden">
        <TouchHelp />

        {/* Projects View */}
        <div
          className="absolute inset-0"
          style={{ display: activeTab === 'projects' ? 'block' : 'none' }}
        >
          {activeTab === 'projects' && (
            <ProjectsView
              onBlueprintLoad={(layoutData, roomType, id, name) => {
                handleLoadFloorplan(layoutData, roomType, id, name)
                setActiveTab('edit')
                setViewMode('3d')
              }}
            />
          )}
        </div>

        {/* Edit View */}
        <div
          className="absolute inset-0"
          style={{ display: activeTab === 'edit' || activeTab === 'items' ? 'block' : 'none' }}
        >
          {/* 3D Viewer */}
          <div
            id="viewer"
            ref={viewerRef}
            className="absolute inset-0"
            style={{ display: viewMode === '3d' ? 'block' : 'none' }}
          >
            {viewMode === '3d' && (
              <>
                <div className="absolute left-1/2 top-16 z-[70] -translate-x-1/2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!hasWalls || generatingFurnishings}
                    onClick={handleGenerateFurnishings}
                    className="shadow-md"
                  >
                    <Sofa className="mr-1.5 h-4 w-4" />
                    {generatingFurnishings ? tOverlay('generating') : tOverlay('generateFurnishings')}
                  </Button>
                </div>
                <div className="absolute right-3 top-16 z-[70] flex items-start gap-2">
                  {textureType && (
                    <TextureSelector
                      type={textureType}
                      onTextureSelect={handleTextureSelect}
                      onClose={() => {
                        setTextureType(null)
                        setCurrentTarget(null)
                      }}
                    />
                  )}
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={textureType === 'wall' ? 'default' : 'secondary'}
                        className="shadow-md"
                        onClick={() => {
                          setTextureType((prev) => (prev === 'wall' ? null : 'wall'))
                          setSelectedItem(null)
                        }}
                      >
                        <Paintbrush className="mr-1 h-3.5 w-3.5" />
                        {tTexture('openWall')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={textureType === 'floor' ? 'default' : 'secondary'}
                        className="shadow-md"
                        onClick={() => {
                          setTextureType((prev) => (prev === 'floor' ? null : 'floor'))
                          setSelectedItem(null)
                        }}
                      >
                        <Grid3x3 className="mr-1 h-3.5 w-3.5" />
                        {tTexture('openFloor')}
                      </Button>
                    </div>
                    <FloorplanMinimap
                      rooms={tourRooms}
                      walls={minimapWalls}
                      items={minimapItems}
                      activeRoomName={activeRoomName}
                      onRoomSelect={handleGoToRoom}
                    />
                  </div>
                </div>
                <div className="absolute right-3 top-1/2 z-[70] -translate-y-1/2">
                  <ViewerZoomControls
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onReset={handleResetView}
                  />
                </div>
                {activeRoomName && (
                  <div className="pointer-events-none absolute bottom-16 left-4 z-[70] rounded bg-black/70 px-3 py-1.5 text-sm text-white">
                    {activeRoomName}
                  </div>
                )}
                {!isFullscreen && <ControlsHelp viewMode="3d" />}
                {renderOverlay && renderOverlay()}

                {itemsLoading > 0 && (
                  <div id="loading-modal">
                    <div className="loading-content">
                      <p>
                        {tMyFloorplans('loading')}
                        <span className="loading-dots">
                          <span></span>
                          <span></span>
                          <span></span>
                        </span>
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 2D Floorplanner */}
          <div
            id="floorplanner"
            className="absolute inset-0 flex"
            style={{ display: viewMode === '2d' ? 'flex' : 'none' }}
          >
            {viewMode === '2d' && !isFullscreen && (
              <aside className="z-[70] flex h-full w-[280px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-background p-2 pt-16">
                <div className="shrink-0">
                  <OverlayControls
                    hasOverlay={overlayState.hasOverlay}
                    hasWalls={hasWalls}
                    opacity={overlayState.opacity}
                    locked={overlayState.locked}
                    compareOverlay={overlayState.compare}
                    calibrating={overlayState.calibrating}
                    calibrateReady={overlayState.calibrateReady}
                    onImport={handleOverlayImport}
                    onDetect={runWallDetect}
                    detecting={detecting}
                    aiConfigured={aiConfigured}
                    onClearWalls={handleClearWalls}
                    onClear={() => {
                      forgetDetectedMarkers()
                      blueprint3dRef.current?.floorplanner?.clearOverlay()
                      setOverlayState({
                        hasOverlay: false,
                        opacity: 0.45,
                        locked: true,
                        compare: true,
                        calibrating: false,
                        calibrateReady: false
                      })
                    }}
                    onOpacity={(value) => blueprint3dRef.current?.floorplanner?.setOverlayOpacity(value)}
                    onLocked={(locked) => blueprint3dRef.current?.floorplanner?.setOverlayLocked(locked)}
                    onCompareOverlay={(compare) => {
                      blueprint3dRef.current?.floorplanner?.setCompareOverlay(compare)
                      setOverlayState((prev) => ({ ...prev, compare }))
                    }}
                    onStartCalibrate={() => {
                      blueprint3dRef.current?.floorplanner?.startCalibration()
                      setOverlayState((prev) => ({
                        ...prev,
                        calibrating: true,
                        calibrateReady: false
                      }))
                    }}
                    onApplyCalibrate={(cm) => {
                      blueprint3dRef.current?.floorplanner?.applyOverlayCalibration(cm)
                      setOverlayState((prev) => ({
                        ...prev,
                        calibrating: false,
                        calibrateReady: false
                      }))
                    }}
                    onCancelCalibrate={() => {
                      blueprint3dRef.current?.floorplanner?.cancelCalibration()
                      setOverlayState((prev) => ({
                        ...prev,
                        calibrating: false,
                        calibrateReady: false
                      }))
                    }}
                    onUndo={handleUndo}
                    canUndo={canUndo}
                  />
                </div>
                <AiWallsStreamPanel model={aiModel} detecting={detecting} stream={aiStream} />
              </aside>
            )}
            <div ref={floorplannerStageRef} className="relative min-w-0 flex-1">
              <canvas id="floorplanner-canvas" ref={floorplannerCanvasRef} className="absolute inset-0 h-full w-full" />
              {viewMode === '2d' && !isFullscreen && (
                <>
                  <FloorplannerControls
                    mode={floorplannerMode}
                    onModeChange={handleFloorplannerModeChange}
                    onDone={handleFloorplannerDone}
                    onUndo={handleUndo}
                    canUndo={canUndo}
                  />
                  {selectedWallThickness !== null && (
                    <div className="absolute right-2 md:right-4 top-16 md:top-20 z-[70]">
                      <WallThicknessPanel
                        thickness={selectedWallThickness}
                        onChange={handleWallThickness}
                      />
                    </div>
                  )}
                  {(floorplannerMode === 'draw' || floorplannerMode === 'drawDoor') && (
                    <div className="absolute left-5 bottom-5 bg-black/50 text-primary-foreground px-2.5 py-1.5 rounded text-sm">
                      {floorplannerMode === 'drawDoor' ? tFloorplanner('doorHint') : tFloorplanner('escHint')}
                    </div>
                  )}
                  <ControlsHelp viewMode="2d" />
                </>
              )}
            </div>
          </div>

          {/* Context Menu */}
          {selectedItem && !textureType && !isFullscreen && (
            <div className="absolute right-2 md:right-4 top-16 md:top-20 z-[70]">
              <ContextMenu
                selectedItem={selectedItem}
                onDelete={handleDeleteItem}
                onResize={handleResizeItem}
                onFixedChange={handleFixedChange}
                onRotate={handleRotateItem}
              />
            </div>
          )}

          {textureType && viewMode !== '3d' && !isFullscreen && (
            <div className="absolute right-2 md:right-4 top-16 md:top-20 z-[70]">
              <TextureSelector
                type={textureType}
                onTextureSelect={handleTextureSelect}
                onClose={() => {
                  setTextureType(null)
                  setCurrentTarget(null)
                }}
              />
            </div>
          )}

          {/* Bed Size Input for generator mode */}
          {mode === 'generator' && !selectedItem && !textureType && onBedSizeChange && !isFullscreen && (
            <div className="absolute right-2 md:right-4 top-16 md:top-20 z-[70]">
              <BedSizeInput onSizeChange={onBedSizeChange} />
            </div>
          )}
        </div>
      </div>

      {/* Current Blueprint Name indicator */}
      {activeTab === 'edit' && !isFullscreen && (
        <div className="absolute bottom-3 left-3 z-40 pointer-events-none max-w-[min(420px,70vw)]">
          <span className="text-xs text-muted-foreground/70 bg-background/40 backdrop-blur-sm px-2 py-1 rounded">
            {currentBlueprint ? `${currentBlueprint.name} · ` : ''}
            {tHowTo('steps')}
          </span>
        </div>
      )}

      <input
        ref={jsonInputRef}
        type="file"
        accept="application/json,.json,application/xml,.xml,.drawio"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleJsonFile(file)
          e.target.value = ''
        }}
      />

      {/* Items Drawer */}
      <ItemsDrawer
        isOpen={activeTab === 'items'}
        onClose={() => setActiveTab('edit')}
        onItemSelect={handleItemSelect}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={settingsOpen}
        onOpenChange={setSettingsOpen}
        onUnitChange={handleUnitChange}
        isLanguageOption={isLanguageOption}
      />

      {/* Save Floorplan Dialog */}
      <SaveFloorplanDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveFloorplan}
        defaultName={`Floorplan ${new Date().toLocaleDateString()}`}
        defaultRoomType={
          Object.values(RoomType).includes(currentMode as RoomType)
            ? (currentMode as RoomType)
            : RoomType.BEDROOM
        }
      />
    </div>
  )
}
