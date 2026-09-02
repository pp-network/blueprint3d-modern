import { Floorplan } from '../model/floorplan'
import { Wall } from '../model/wall'
import { Corner } from '../model/corner'
import { Room } from '../model/room'
import { HalfEdge } from '../model/half_edge'
import { Dimensioning } from '../core/dimensioning'
import { Utils } from '../core/utils'
import type { Floorplanner } from './floorplanner'

/** */
export const floorplannerModes = {
  MOVE: 0,
  DRAW: 1,
  DELETE: 2,
  DRAW_DOOR: 3
}

// grid parameters
const gridSpacing = 20 // pixels
const gridWidth = 1
const gridColor = '#f1f1f1'

// room config
const roomColor = '#f9f9f9'

// wall config
const wallWidth = 5
const wallWidthHover = 7
const wallColor = '#dddddd'
const wallColorHover = '#008cba'
const edgeColor = '#888888'
const edgeColorHover = '#008cba'
const edgeWidth = 1

const deleteColor = '#ff0000'

// corner config
const cornerRadius = 0
const cornerRadiusHover = 7
const cornerColor = '#cccccc'
const cornerColorHover = '#008cba'

/**
 * The View to be used by a Floorplanner to render in/interact with.
 */
export class FloorplannerView {
  /** The canvas element. */
  private canvasElement: HTMLCanvasElement

  /** The 2D context. */
  private context: CanvasRenderingContext2D

  /** Resize handler reference for cleanup */
  private resizeHandler: () => void

  /** */
  constructor(
    private floorplan: Floorplan,
    private viewmodel: Floorplanner,
    private canvas: string
  ) {
    this.canvasElement = document.getElementById(canvas) as HTMLCanvasElement
    this.context = this.canvasElement.getContext('2d') as CanvasRenderingContext2D

    // Bind resize handler for later cleanup
    this.resizeHandler = () => {
      this.handleWindowResize()
    }
    window.addEventListener('resize', this.resizeHandler)
    this.handleWindowResize()
  }

  /** Cleanup method to remove event listeners */
  public destroy() {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
    }
  }

  /** */
  public handleWindowResize() {
    const canvasElement = document.getElementById(this.canvas) as HTMLCanvasElement
    // Check if canvas element exists before accessing parentElement
    if (!canvasElement) {
      console.warn('Canvas element not found:', this.canvas)
      return
    }
    const parent = canvasElement.parentElement
    if (parent) {
      const parentHeight = parent.clientHeight
      const parentWidth = parent.clientWidth
      canvasElement.style.height = parentHeight + 'px'
      canvasElement.style.width = parentWidth + 'px'
      this.canvasElement.height = parentHeight
      this.canvasElement.width = parentWidth
    }
    this.draw()
  }

  /** */
  public draw() {
    this.context.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height)

    this.drawGrid()
    this.drawOverlay()

    const compare = Boolean(this.viewmodel.overlay && this.viewmodel.compareOverlay)
    if (!compare) {
      this.floorplan.getRooms().forEach((room) => {
        this.drawRoom(room)
      })
    }

    this.floorplan.getWalls().forEach((wall) => {
      if (wall.opening) {
        this.drawOpening(wall)
        return
      }
      this.drawWall(wall, compare)
    })

    this.floorplan.getCorners().forEach((corner) => {
      this.drawCorner(corner)
    })

    if (
      this.viewmodel.mode == floorplannerModes.DRAW ||
      this.viewmodel.mode == floorplannerModes.DRAW_DOOR
    ) {
      this.drawTarget(
        this.viewmodel.targetX,
        this.viewmodel.targetY,
        this.viewmodel.lastNode,
        this.viewmodel.mode == floorplannerModes.DRAW_DOOR
      )
    }

    this.floorplan.getRooms().forEach((room) => {
      this.drawRoomLabel(room)
    })

    this.floorplan.getWalls().forEach((wall) => {
      if (wall.opening) return
      this.drawWallLabels(wall)
    })
  }

  /** */
  private drawWallLabels(wall: Wall) {
    // we'll just draw the shorter label... idk
    if (wall.backEdge && wall.frontEdge) {
      if (wall.backEdge.interiorDistance < wall.frontEdge.interiorDistance) {
        this.drawEdgeLabel(wall.backEdge)
      } else {
        this.drawEdgeLabel(wall.frontEdge)
      }
    } else if (wall.backEdge) {
      this.drawEdgeLabel(wall.backEdge)
    } else if (wall.frontEdge) {
      this.drawEdgeLabel(wall.frontEdge)
    }
  }

  /** */
  private drawOverlay() {
    const overlay = this.viewmodel.overlay
    if (!overlay?.image) {
      return
    }
    const x = this.viewmodel.convertX(overlay.originX)
    const y = this.viewmodel.convertY(overlay.originY)
    const widthPx =
      overlay.image.naturalWidth * overlay.cmPerImagePixel * this.viewmodel.pixelsPerCm
    const heightPx =
      overlay.image.naturalHeight * overlay.cmPerImagePixel * this.viewmodel.pixelsPerCm
    this.context.save()
    this.context.globalAlpha = overlay.opacity
    this.context.drawImage(overlay.image, x, y, widthPx, heightPx)
    this.context.restore()

    if (this.viewmodel.overlayCalibratePoints.length > 0) {
      this.context.fillStyle = '#f97316'
      this.viewmodel.overlayCalibratePoints.forEach((p) => {
        this.context.beginPath()
        this.context.arc(this.viewmodel.convertX(p.x), this.viewmodel.convertY(p.y), 5, 0, Math.PI * 2)
        this.context.fill()
      })
      if (this.viewmodel.overlayCalibratePoints.length === 2) {
        const [a, b] = this.viewmodel.overlayCalibratePoints
        this.drawLine(
          this.viewmodel.convertX(a.x),
          this.viewmodel.convertY(a.y),
          this.viewmodel.convertX(b.x),
          this.viewmodel.convertY(b.y),
          2,
          '#f97316'
        )
      }
    }
  }

  private drawWall(wall: Wall, compare = false) {
    const hover = wall === this.viewmodel.activeWall
    const selected = wall === this.viewmodel.selectedWall
    let color = compare ? '#e11d48' : wallColor
    if (hover && this.viewmodel.mode == floorplannerModes.DELETE) {
      color = deleteColor
    } else if (selected) {
      color = '#0f766e'
    } else if (hover) {
      color = wallColorHover
    }
    const thicknessPx = compare
      ? selected || hover
        ? 4
        : 2.5
      : Math.max(wallWidth, wall.thickness * this.viewmodel.pixelsPerCm * 0.4)
    const lineWidth = selected || hover ? Math.max(wallWidthHover, thicknessPx) : thicknessPx
    this.drawLine(
      this.viewmodel.convertX(wall.getStartX()),
      this.viewmodel.convertY(wall.getStartY()),
      this.viewmodel.convertX(wall.getEndX()),
      this.viewmodel.convertY(wall.getEndY()),
      lineWidth,
      color
    )
    if (!compare && !hover && wall.frontEdge) {
      this.drawEdge(wall.frontEdge, hover)
    }
    if (!compare && !hover && wall.backEdge) {
      this.drawEdge(wall.backEdge, hover)
    }
  }

  /** */
  private drawEdgeLabel(edge: HalfEdge) {
    const pos = edge.interiorCenter()
    const length = edge.interiorDistance()
    if (length < 60) {
      // dont draw labels on walls this short
      return
    }
    this.context.font = 'normal 12px Arial'
    this.context.fillStyle = '#000000'
    this.context.textBaseline = 'middle'
    this.context.textAlign = 'center'
    this.context.strokeStyle = '#ffffff'
    this.context.lineWidth = 4

    this.context.strokeText(
      Dimensioning.cmToMeasure(length),
      this.viewmodel.convertX(pos.x),
      this.viewmodel.convertY(pos.y)
    )
    this.context.fillText(
      Dimensioning.cmToMeasure(length),
      this.viewmodel.convertX(pos.x),
      this.viewmodel.convertY(pos.y)
    )
  }

  /** */
  private drawEdge(edge: HalfEdge, hover: boolean) {
    let color = edgeColor
    if (hover && this.viewmodel.mode == floorplannerModes.DELETE) {
      color = deleteColor
    } else if (hover) {
      color = edgeColorHover
    }
    const corners = edge.corners()

    this.drawPolygon(
      Utils.map(corners, (corner) => {
        return this.viewmodel.convertX(corner.x)
      }),
      Utils.map(corners, (corner) => {
        return this.viewmodel.convertY(corner.y)
      }),
      false,
      null,
      true,
      color,
      edgeWidth
    )
  }

  /** */
  private drawRoom(room: Room) {
    this.drawPolygon(
      Utils.map(room.corners, (corner: Corner) => {
        return this.viewmodel.convertX(corner.x)
      }),
      Utils.map(room.corners, (corner: Corner) => {
        return this.viewmodel.convertY(corner.y)
      }),
      true,
      roomColor
    )
  }

  /** */
  private drawCorner(corner: Corner) {
    const hover = corner === this.viewmodel.activeCorner
    let color = cornerColor
    if (hover && this.viewmodel.mode == floorplannerModes.DELETE) {
      color = deleteColor
    } else if (hover) {
      color = cornerColorHover
    }
    this.drawCircle(
      this.viewmodel.convertX(corner.x),
      this.viewmodel.convertY(corner.y),
      hover ? cornerRadiusHover : cornerRadius,
      color
    )
  }

  private drawRoomLabel(room: Room) {
    const name = room.name?.trim()
    if (!name) return
    const at = room.labelAnchor ?? room.getCenter2D()
    const x = this.viewmodel.convertX(at.x)
    const y = this.viewmodel.convertY(at.y)
    this.context.save()
    this.context.font = '600 13px Arial'
    this.context.textAlign = 'center'
    this.context.textBaseline = 'middle'
    this.context.lineWidth = 4
    this.context.strokeStyle = 'rgba(255,255,255,0.9)'
    this.context.fillStyle = '#1e293b'
    this.context.strokeText(name, x, y)
    this.context.fillText(name, x, y)
    this.context.restore()
  }

  /** */
  private drawTarget(x: number, y: number, lastNode: Corner | null, door = false) {
    this.drawCircle(
      this.viewmodel.convertX(x),
      this.viewmodel.convertY(y),
      cornerRadiusHover,
      door ? '#ea580c' : cornerColorHover
    )
    if (this.viewmodel.lastNode) {
      this.drawLine(
        this.viewmodel.convertX(lastNode!.x),
        this.viewmodel.convertY(lastNode!.y),
        this.viewmodel.convertX(x),
        this.viewmodel.convertY(y),
        door ? 2 : wallWidthHover,
        door ? '#ea580c' : wallColorHover,
        door ? [8, 6] : undefined
      )
    }
  }

  /** */
  private drawOpening(wall: Wall) {
    const hover = wall === this.viewmodel.activeWall
    const selected = wall === this.viewmodel.selectedWall
    let color = '#94a3b8'
    let width = 2
    if (hover && this.viewmodel.mode == floorplannerModes.DELETE) {
      color = deleteColor
      width = 4
    } else if (selected || hover) {
      color = '#ea580c'
      width = 4
    }
    this.drawLine(
      this.viewmodel.convertX(wall.getStartX()),
      this.viewmodel.convertY(wall.getStartY()),
      this.viewmodel.convertX(wall.getEndX()),
      this.viewmodel.convertY(wall.getEndY()),
      width,
      color,
      [8, 6]
    )
  }

  private drawLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    width: number,
    color: string,
    dash?: number[]
  ) {
    // width is an integer
    // color is a hex string, i.e. #ff0000
    this.context.save()
    this.context.beginPath()
    this.context.moveTo(startX, startY)
    this.context.lineTo(endX, endY)
    this.context.lineWidth = width
    this.context.strokeStyle = color
    this.context.setLineDash(dash ?? [])
    this.context.stroke()
    this.context.restore()
  }

  /** */
  private drawPolygon(
    xArr: number[],
    yArr: number[],
    fill?: boolean,
    fillColor?: string | null,
    stroke?: boolean,
    strokeColor?: string,
    strokeWidth?: number
  ) {
    // fillColor is a hex string, i.e. #ff0000
    fill = fill || false
    stroke = stroke || false
    this.context.beginPath()
    this.context.moveTo(xArr[0], yArr[0])
    for (let i = 1; i < xArr.length; i++) {
      this.context.lineTo(xArr[i], yArr[i])
    }
    this.context.closePath()
    if (fill && fillColor) {
      this.context.fillStyle = fillColor
      this.context.fill()
    }
    if (stroke && strokeColor) {
      this.context.lineWidth = strokeWidth!
      this.context.strokeStyle = strokeColor
      this.context.stroke()
    }
  }

  /** */
  private drawCircle(centerX: number, centerY: number, radius: number, fillColor: string) {
    this.context.beginPath()
    this.context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false)
    this.context.fillStyle = fillColor
    this.context.fill()
  }

  /** returns n where -gridSize/2 < n <= gridSize/2  */
  private calculateGridOffset(n: number): number {
    if (n >= 0) {
      return ((n + gridSpacing / 2.0) % gridSpacing) - gridSpacing / 2.0
    } else {
      return ((n - gridSpacing / 2.0) % gridSpacing) + gridSpacing / 2.0
    }
  }

  /** */
  private drawGrid() {
    const offsetX = this.calculateGridOffset(-this.viewmodel.originX)
    const offsetY = this.calculateGridOffset(-this.viewmodel.originY)
    const width = this.canvasElement.width
    const height = this.canvasElement.height
    for (let x = 0; x <= width / gridSpacing; x++) {
      this.drawLine(
        gridSpacing * x + offsetX,
        0,
        gridSpacing * x + offsetX,
        height,
        gridWidth,
        gridColor
      )
    }
    for (let y = 0; y <= height / gridSpacing; y++) {
      this.drawLine(
        0,
        gridSpacing * y + offsetY,
        width,
        gridSpacing * y + offsetY,
        gridWidth,
        gridColor
      )
    }
  }
}
