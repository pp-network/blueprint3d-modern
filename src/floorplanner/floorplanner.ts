import { Floorplan } from '../model/floorplan'
import { Wall } from '../model/wall'
import { Corner } from '../model/corner'
import { FloorplannerView, floorplannerModes } from './floorplanner_view'
import {
  fillOpening,
  isolateOpening,
  isolateOpeningCorner,
  isOpeningOnlyCorner,
  openingAtCorner,
  syncOpeningPlacement
} from '../model/opening-wall'
import { EventEmitter } from '../core/events'
import type { Model } from '../model/model'
import {
  applyCalibration,
  copyOverlayTransform,
  createOverlay,
  createOverlayAlignedToWalls,
  restoreOverlayTransform,
  type FloorplanOverlay,
  type OverlayTransform
} from './overlay'
import { applyWallTraceToModel } from '../vision/apply-trace'
import type { WallTrace } from '../vision/types'

type FloorplannerMode = (typeof floorplannerModes)[keyof typeof floorplannerModes]

/** how much will we move a corner to make a wall axis aligned (cm) */
const snapTolerance = 25

/**
 * The Floorplanner implements an interactive tool for creation of floorplans.
 */
export class Floorplanner {
  /** */
  public mode: FloorplannerMode = floorplannerModes.MOVE

  /** */
  public activeWall: Wall | null = null

  /** */
  public activeCorner: Corner | null = null

  /** */
  public originX = 0

  /** */
  public originY = 0

  /** drawing state */
  public targetX = 0

  /** drawing state */
  public targetY = 0

  /** drawing state */
  public lastNode: Corner | null = null

  /** Click-selected wall for thickness editing. */
  public selectedWall: Wall | null = null

  public overlay: FloorplanOverlay | null = null

  public lastWallTrace: WallTrace | null = null

  public overlayCalibrating = false
  /** Draw detected walls as thin traces so the CAD overlay stays readable. */
  public compareOverlay = true

  public overlayCalibratePoints: Array<{ x: number; y: number }> = []

  public readonly wallSelectedCallbacks = new EventEmitter<Wall | null>()

  public readonly overlayChanged = new EventEmitter<void>()

  public readonly calibrateReady = new EventEmitter<{
    p1: { x: number; y: number }
    p2: { x: number; y: number }
  }>()

  public readonly calibrateChanged = new EventEmitter<{
    calibrating: boolean
    ready: boolean
    points: number
  }>()

  /** */
  // @ts-ignore - wallWidth is declared but not used, keeping for future use
  private wallWidth: number

  /** */
  private modeResetCallbacks: Array<(mode: FloorplannerMode) => void> = []

  /** */
  private canvasElement: HTMLCanvasElement

  /** */
  private view: FloorplannerView

  /** */
  private mouseDown = false

  /** */
  private mouseMoved = false

  /** in ThreeJS coords */
  private mouseX = 0

  /** in ThreeJS coords */
  private mouseY = 0

  /** in ThreeJS coords */
  private rawMouseX = 0

  /** in ThreeJS coords */
  private rawMouseY = 0

  /** mouse position at last click */
  private lastX = 0

  /** mouse position at last click */
  private lastY = 0

  private drawChain: Array<{ x: number; y: number }> = []

  private drawRedo: Array<{ x: number; y: number }> = []

  private overlayUndoBySnapshot = new Map<string, OverlayTransform>()

  private pendingOverlayUndo: OverlayTransform | null = null

  /** */
  public cmPerPixel: number

  /** */
  public pixelsPerCm: number

  /** Add a callback for mode reset */
  public addModeResetCallback(callback: (mode: FloorplannerMode) => void): void {
    this.modeResetCallbacks.push(callback)
  }

  /** Provides jQuery-style Callbacks API for backward compatibility */
  public get modeResetCallbacksAPI(): {
    add: (callback: (mode: FloorplannerMode) => void) => void
  } {
    return {
      add: (callback: (mode: FloorplannerMode) => void) => this.addModeResetCallback(callback)
    }
  }

  /** */
  constructor(
    canvas: string,
    private floorplan: Floorplan,
    private model?: Model
  ) {
    this.canvasElement = document.getElementById(canvas) as HTMLCanvasElement

    this.view = new FloorplannerView(this.floorplan, this, canvas)

    const cmPerFoot = 30.48
    const pixelsPerFoot = 15.0
    this.cmPerPixel = cmPerFoot * (1.0 / pixelsPerFoot)
    this.pixelsPerCm = 1.0 / this.cmPerPixel

    this.wallWidth = 10.0 * this.pixelsPerCm

    // Initialization:

    this.setMode(floorplannerModes.MOVE)

    this.canvasElement.addEventListener('mousedown', () => {
      this.mousedown()
    })
    this.canvasElement.addEventListener('mousemove', (event: MouseEvent) => {
      this.mousemove(event)
    })
    this.canvasElement.addEventListener('mouseup', () => {
      this.mouseup()
    })
    this.canvasElement.addEventListener('mouseleave', () => {
      this.mouseleave()
    })

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.keyCode == 27) {
        this.escapeKey()
        return
      }
      if (e.key !== 'Backspace' && e.key !== 'Delete') {
        return
      }
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if (this.deleteSelectedOrHovered()) {
        e.preventDefault()
        return
      }
      if (e.key === 'Backspace' && this.undoLastChange()) {
        e.preventDefault()
      }
    })

    floorplan.roomLoadedCallbacks.add(() => {
      this.reset()
    })
  }

  /** */
  private escapeKey(): void {
    this.setMode(floorplannerModes.MOVE)
  }

  /** */
  private updateTarget(): void {
    if (this.isDrawMode() && this.lastNode) {
      if (Math.abs(this.mouseX - this.lastNode.x) < snapTolerance) {
        this.targetX = this.lastNode.x
      } else {
        this.targetX = this.mouseX
      }
      if (Math.abs(this.mouseY - this.lastNode.y) < snapTolerance) {
        this.targetY = this.lastNode.y
      } else {
        this.targetY = this.mouseY
      }
    } else {
      this.targetX = this.mouseX
      this.targetY = this.mouseY
    }

    this.view.draw()
  }

  /** */
  private mousedown(): void {
    this.mouseDown = true
    this.mouseMoved = false
    this.lastX = this.rawMouseX
    this.lastY = this.rawMouseY

    if (this.overlayCalibrating) {
      return
    }

    if (this.mode == floorplannerModes.MOVE) {
      this.model?.beginHistory()
      if (this.activeCorner) {
        const opening = openingAtCorner(this.activeCorner)
        if (opening) {
          this.activeCorner = isolateOpeningCorner(this.floorplan, opening, this.activeCorner)
          this.activeWall = null
        }
      } else if (this.activeWall?.opening) {
        isolateOpening(this.floorplan, this.activeWall)
      }
    }

    // delete
    if (this.mode == floorplannerModes.DELETE) {
      this.model?.beginHistory()
      if (this.activeCorner) {
        this.activeCorner.removeAll()
        this.model?.commitHistory()
        this.setSelectedWall(null)
      } else if (this.activeWall) {
        if (this.activeWall.opening) {
          fillOpening(this.floorplan, this.activeWall)
        } else {
          this.activeWall.remove()
        }
        this.model?.commitHistory()
        this.setSelectedWall(null)
      } else if (this.removeDetectedOpeningAt(this.mouseX, this.mouseY)) {
        this.model?.commitHistory()
      } else {
        this.model?.history.cancel()
        this.setMode(floorplannerModes.MOVE)
      }
    }
  }

  /** */
  private mousemove(event: MouseEvent): void {
    this.mouseMoved = true

    // update mouse
    this.rawMouseX = event.clientX
    this.rawMouseY = event.clientY

    const rect = this.canvasElement.getBoundingClientRect()
    this.mouseX = (event.clientX - rect.left) * this.cmPerPixel + this.originX * this.cmPerPixel
    this.mouseY = (event.clientY - rect.top) * this.cmPerPixel + this.originY * this.cmPerPixel

    // update target (snapped position of actual mouse)
    if (
      this.isDrawMode() ||
      (this.mode == floorplannerModes.MOVE && this.mouseDown)
    ) {
      this.updateTarget()
    }

    // Hover corners first (including door jambs) so a vertex can be dragged without the wall.
    if (!this.mouseDown) {
      const hoverCorner: Corner | null = this.floorplan.overlappedCorner(this.mouseX, this.mouseY)
      const hoverWall: Wall | null = hoverCorner
        ? null
        : this.floorplan.overlappedWall(this.mouseX, this.mouseY)
      let draw = false
      if (hoverCorner != this.activeCorner) {
        this.activeCorner = hoverCorner
        draw = true
      }
      if (this.activeCorner == null) {
        if (hoverWall != this.activeWall) {
          this.activeWall = hoverWall
          draw = true
        }
      } else if (this.activeWall != null) {
        this.activeWall = null
        draw = true
      }
      if (draw) {
        this.view.draw()
      }
    }

    // panning (view) or moving unlocked overlay
    if (this.mouseDown && !this.activeCorner && !this.activeWall && !this.overlayCalibrating) {
      if (this.overlay && !this.overlay.locked) {
        this.overlay.originX += (this.rawMouseX - this.lastX) * this.cmPerPixel
        this.overlay.originY += (this.rawMouseY - this.lastY) * this.cmPerPixel
        this.overlayChanged.fire()
      } else {
        this.originX += this.lastX - this.rawMouseX
        this.originY += this.lastY - this.rawMouseY
      }
      this.lastX = this.rawMouseX
      this.lastY = this.rawMouseY
      this.view.draw()
    }

    // dragging
    if (this.mode == floorplannerModes.MOVE && this.mouseDown) {
      if (this.activeCorner) {
        const free = isOpeningOnlyCorner(this.activeCorner)
        this.activeCorner.move(this.mouseX, this.mouseY, { merge: !free })
        this.activeCorner.snapToAxis(snapTolerance)
        if (free) {
          const opening = openingAtCorner(this.activeCorner)
          if (opening) syncOpeningPlacement(this.floorplan, opening)
        }
      } else if (this.activeWall) {
        const dx = (this.rawMouseX - this.lastX) * this.cmPerPixel
        const dy = (this.rawMouseY - this.lastY) * this.cmPerPixel
        if (this.activeWall.opening) {
          this.activeWall.getStart().move(
            this.activeWall.getStartX() + dx,
            this.activeWall.getStartY() + dy,
            { merge: false }
          )
          this.activeWall.getEnd().move(
            this.activeWall.getEndX() + dx,
            this.activeWall.getEndY() + dy,
            { merge: false }
          )
          syncOpeningPlacement(this.floorplan, this.activeWall)
        } else {
          this.activeWall.relativeMove(dx, dy)
          this.activeWall.snapToAxis(snapTolerance)
        }
        this.lastX = this.rawMouseX
        this.lastY = this.rawMouseY
      }
      this.view.draw()
    }
  }

  /** */
  private mouseup(): void {
    this.mouseDown = false

    if (this.overlayCalibrating && !this.mouseMoved) {
      if (this.overlayCalibratePoints.length < 2) {
        this.overlayCalibratePoints.push({ x: this.mouseX, y: this.mouseY })
        this.view.draw()
        this.emitCalibrateChanged()
        if (this.overlayCalibratePoints.length >= 2) {
          const [p1, p2] = this.overlayCalibratePoints
          this.calibrateReady.fire({ p1, p2 })
        }
      }
      return
    }

    if (this.mode == floorplannerModes.MOVE) {
      this.model?.commitHistory()
      if (!this.mouseMoved) {
        this.setSelectedWall(this.activeWall)
      }
    }

    // drawing
    if (this.isDrawMode() && !this.mouseMoved) {
      this.model?.beginHistory()
      const corner = this.floorplan.newCorner(this.targetX, this.targetY)
      if (this.lastNode != null) {
        this.floorplan.newWall(this.lastNode, corner, {
          opening: this.mode == floorplannerModes.DRAW_DOOR
        })
      }
      const joined =
        this.mode != floorplannerModes.DRAW_DOOR &&
        corner.mergeWithIntersected() &&
        this.lastNode != null
      if (joined) {
        this.setMode(floorplannerModes.MOVE)
      } else {
        this.lastNode = corner
        this.drawChain.push({ x: corner.x, y: corner.y })
        this.drawRedo = []
      }
      this.model?.commitHistory()
    }
  }

  /** */
  private mouseleave(): void {
    this.mouseDown = false
    //scope.setMode(scope.modes.MOVE);
  }

  /** Resets the view - centers and resizes the floorplan */
  public reset(): void {
    this.resizeView()
    this.setMode(floorplannerModes.MOVE)
    this.resetOrigin()
    this.view.draw()
  }

  /** Resizes the view to fit the container */
  public resizeView(): void {
    this.view.handleWindowResize()
  }

  private isDrawMode(): boolean {
    return this.mode == floorplannerModes.DRAW || this.mode == floorplannerModes.DRAW_DOOR
  }

  /** Sets the interaction mode */
  public setMode(mode: FloorplannerMode): void {
    this.lastNode = null
    this.drawChain = []
    this.drawRedo = []
    this.mode = mode
    this.modeResetCallbacks.forEach((callback) => callback(mode))
    this.updateTarget()
  }

  /** Sets the origin so that floorplan is centered */
  public resetOrigin(): void {
    const centerX = this.canvasElement.clientWidth / 2.0
    const centerY = this.canvasElement.clientHeight / 2.0
    const centerFloorplan = this.floorplan.getCenter()
    this.originX = centerFloorplan.x * this.pixelsPerCm - centerX
    this.originY = centerFloorplan.z * this.pixelsPerCm - centerY
  }

  /** Convert from THREEjs coords to canvas coords. */
  public convertX(x: number): number {
    return (x - this.originX * this.cmPerPixel) * this.pixelsPerCm
  }

  /** Convert from THREEjs coords to canvas coords. */
  public convertY(y: number): number {
    return (y - this.originY * this.cmPerPixel) * this.pixelsPerCm
  }

  private deleteSelectedOrHovered(): boolean {
    const wall = this.selectedWall ?? this.activeWall
    const corner = wall ? null : this.activeCorner
    if (!wall && !corner) return false
    this.model?.beginHistory()
    if (wall) {
      if (wall.opening) {
        fillOpening(this.floorplan, wall)
      } else {
        wall.remove()
      }
      this.setSelectedWall(null)
    } else if (corner) {
      corner.removeAll()
      this.setSelectedWall(null)
    }
    if (this.lastNode && !this.floorplan.getCorners().includes(this.lastNode)) {
      this.lastNode = null
    }
    this.activeWall = null
    this.activeCorner = null
    this.model?.commitHistory()
    this.view.draw()
    return true
  }

  public setSelectedWall(wall: Wall | null): void {
    if (this.selectedWall === wall) {
      return
    }
    this.selectedWall = wall
    this.wallSelectedCallbacks.fire(wall)
    this.view.draw()
  }

  public setWallThickness(cm: number): void {
    if (!this.selectedWall || cm <= 0) {
      return
    }
    this.model?.beginHistory()
    this.selectedWall.thickness = cm
    this.floorplan.update()
    this.model?.commitHistory()
    this.view.draw()
  }

  public setOverlayImage(image: HTMLImageElement, options?: { overallWidthCm?: number }): void {
    const walls = this.floorplan.getWalls()
    const size = this.floorplan.getSize()
    const center = this.floorplan.getCenter()
    const hasWalls = walls.length > 0 && Number.isFinite(size.x) && size.x > 1
    const prior = this.overlay
      ? copyOverlayTransform(this.overlay)
      : this.floorplan.detectTransform
    if (hasWalls) {
      this.overlay = createOverlayAlignedToWalls(
        image,
        {
          minX: center.x - size.x / 2,
          minY: center.z - size.z / 2,
          maxX: center.x + size.x / 2,
          maxY: center.z + size.z / 2
        },
        {
          overallWidthCm: options?.overallWidthCm,
          prior,
          opacity: this.overlay?.opacity,
          locked: this.overlay?.locked
        }
      )
    } else {
      const cx = Number.isFinite(center.x) ? center.x : 0
      const cz = Number.isFinite(center.z) ? center.z : 0
      const canvasW = this.canvasElement.clientWidth || this.canvasElement.width || 1000
      const targetWidthCm =
        options?.overallWidthCm && options.overallWidthCm > 0
          ? options.overallWidthCm
          : Math.max(canvasW * this.cmPerPixel * 0.9, 1600)
      this.overlay = createOverlay(image, cx, cz, targetWidthCm)
    }
    this.lastWallTrace = null
    this.overlayCalibrating = false
    this.overlayCalibratePoints = []
    this.overlayUndoBySnapshot.clear()
    this.pendingOverlayUndo = null
    this.frameOnOverlay()
    this.overlayChanged.fire()
    this.view.draw()
  }

  public frameOnOverlay(): void {
    if (!this.overlay) {
      return
    }
    const widthCm = (this.overlay.image.naturalWidth || this.overlay.image.width) * this.overlay.cmPerImagePixel
    const heightCm = (this.overlay.image.naturalHeight || this.overlay.image.height) * this.overlay.cmPerImagePixel
    const cx = this.overlay.originX + widthCm / 2
    const cy = this.overlay.originY + heightCm / 2
    const centerX = (this.canvasElement.clientWidth || this.canvasElement.width) / 2
    const centerY = (this.canvasElement.clientHeight || this.canvasElement.height) / 2
    this.originX = cx * this.pixelsPerCm - centerX
    this.originY = cy * this.pixelsPerCm - centerY
    this.view.draw()
  }

  public clearOverlay(): void {
    this.overlay = null
    this.lastWallTrace = null
    this.overlayCalibrating = false
    this.overlayCalibratePoints = []
    this.overlayUndoBySnapshot.clear()
    this.pendingOverlayUndo = null
    this.emitCalibrateChanged()
    this.overlayChanged.fire()
    this.view.draw()
  }

  public setOverlayOpacity(opacity: number): void {
    if (!this.overlay) {
      return
    }
    this.overlay.opacity = Math.min(1, Math.max(0, opacity))
    this.overlayChanged.fire()
    this.view.draw()
  }

  public setOverlayLocked(locked: boolean): void {
    if (!this.overlay) {
      return
    }
    this.overlay.locked = locked
    this.overlayChanged.fire()
    this.view.draw()
  }

  public setCompareOverlay(compare: boolean): void {
    this.compareOverlay = compare
    this.overlayChanged.fire()
    this.view.draw()
  }

  public startCalibration(): void {
    if (!this.overlay) {
      return
    }
    this.overlayCalibrating = true
    this.overlayCalibratePoints = []
    this.setMode(floorplannerModes.MOVE)
    this.emitCalibrateChanged()
    this.view.draw()
  }

  public applyOverlayCalibration(realLengthCm: number): void {
    if (!this.overlay || this.overlayCalibratePoints.length < 2) {
      return
    }
    const [p1, p2] = this.overlayCalibratePoints
    const before = copyOverlayTransform(this.overlay)
    applyCalibration(this.overlay, p1, p2, realLengthCm)
    this.overlayCalibrating = false
    this.overlayCalibratePoints = []
    if (this.lastWallTrace && this.model) {
      this.model.beginHistory()
      applyWallTraceToModel(this.model, this.overlay, this.lastWallTrace, undefined, { seedHistory: false })
      const changed = this.model.commitHistory()
      if (changed && this.model.history.current) {
        this.overlayUndoBySnapshot.set(this.model.history.current, before)
        this.pendingOverlayUndo = null
      } else {
        this.pendingOverlayUndo = before
      }
    } else {
      this.pendingOverlayUndo = before
    }
    this.emitCalibrateChanged()
    this.overlayChanged.fire()
    this.view.draw()
  }

  public cancelCalibration(): void {
    this.overlayCalibrating = false
    this.overlayCalibratePoints = []
    this.emitCalibrateChanged()
    this.view.draw()
  }

  public get canUndoLastChange(): boolean {
    if (this.overlayCalibrating) {
      return this.overlayCalibratePoints.length > 0
    }
    if (this.pendingOverlayUndo) {
      return true
    }
    const current = this.model?.history.current
    if (current && this.overlayUndoBySnapshot.has(current)) {
      return true
    }
    return Boolean(this.model?.history.canUndo)
  }

  public undoLastChange(): boolean {
    if (this.overlayCalibrating) {
      if (this.overlayCalibratePoints.length === 0) {
        return false
      }
      this.overlayCalibratePoints.pop()
      this.emitCalibrateChanged()
      this.view.draw()
      return true
    }

    const current = this.model?.history.current
    const paired = current ? this.overlayUndoBySnapshot.get(current) : undefined
    if (paired && this.overlay) {
      this.overlayUndoBySnapshot.delete(current!)
      restoreOverlayTransform(this.overlay, paired)
      this.model?.undo()
      this.syncDrawNodeAfterUndo()
      this.overlayChanged.fire()
      this.view.draw()
      return true
    }

    if (this.model?.history.canUndo) {
      this.model.undo()
      this.syncDrawNodeAfterUndo()
      this.view.draw()
      return true
    }

    if (this.pendingOverlayUndo && this.overlay) {
      restoreOverlayTransform(this.overlay, this.pendingOverlayUndo)
      this.pendingOverlayUndo = null
      this.overlayChanged.fire()
      this.view.draw()
      return true
    }

    return false
  }

  public redoLastChange(): boolean {
    if (!this.model?.history.canRedo) {
      return false
    }
    this.model.redo()
    if (this.isDrawMode() && this.drawRedo.length > 0) {
      const point = this.drawRedo.pop()!
      this.drawChain.push(point)
      this.lastNode = this.findCornerNear(point)
    }
    this.view.draw()
    return true
  }

  private emitCalibrateChanged(): void {
    this.calibrateChanged.fire({
      calibrating: this.overlayCalibrating,
      ready: this.overlayCalibratePoints.length >= 2,
      points: this.overlayCalibratePoints.length
    })
  }

  private syncDrawNodeAfterUndo(): void {
    if (!this.isDrawMode()) {
      this.lastNode = null
      return
    }
    const undone = this.drawChain.pop()
    if (undone) {
      this.drawRedo.push(undone)
    }
    const prev = this.drawChain[this.drawChain.length - 1]
    this.lastNode = prev ? this.findCornerNear(prev) : null
  }

  private removeDetectedOpeningAt(x: number, y: number): boolean {
    const placements = this.floorplan.detectedPlacements
    const map = this.floorplan.detectTransform
    if (!placements?.openings?.length) return false
    let best = -1
    let bestDist = 30
    for (let i = 0; i < placements.openings.length; i++) {
      const opening = placements.openings[i]
      const wx = map ? map.originX + opening.x * map.cmPerImagePixel : opening.x
      const wy = map ? map.originY + opening.y * map.cmPerImagePixel : opening.y
      const dist = Math.hypot(wx - x, wy - y)
      if (dist < bestDist) {
        best = i
        bestDist = dist
      }
    }
    if (best < 0) return false
    placements.openings.splice(best, 1)
    this.view.draw()
    return true
  }

  private findCornerNear(point: { x: number; y: number }): Corner | null {
    let best: Corner | null = null
    let bestDist = 1
    for (const corner of this.floorplan.getCorners()) {
      const dist = Math.hypot(corner.x - point.x, corner.y - point.y)
      if (dist < bestDist) {
        best = corner
        bestDist = dist
      }
    }
    return best
  }
}
