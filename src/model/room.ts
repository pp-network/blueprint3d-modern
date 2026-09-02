import * as THREE from 'three'
import { Utils } from '../core/utils'
import { EventEmitter } from '../core/events'
import type { Corner } from './corner'
import type { Floorplan } from './floorplan'
import { HalfEdge } from './half_edge'

/*
TODO
var Vec2 = require('vec2')
var segseg = require('segseg')
var Polygon = require('polygon')
*/

/** Default texture to be used if nothing is provided. Empty URL uses local wood. */
const defaultRoomTexture = {
  url: '',
  scale: 400
}

/**
 * A Room is the combination of a Floorplan with a floor plane.
 */
export class Room {
  /** Label from the drawing, or a generated fallback. */
  public name = ''

  /** World-cm point to draw the name; usually the OCR label, not the polygon centroid. */
  public labelAnchor: { x: number; y: number } | null = null

  /** */
  public interiorCorners: { x: number; y: number }[] = []

  /** */
  private edgePointer: HalfEdge | null = null

  /** floor plane for intersection testing */
  public floorPlane!: THREE.Mesh

  /** */
  // @ts-ignore - customTexture is declared but not used, keeping for future use
  private customTexture = false

  /** */
  private floorChangeCallbacks = new EventEmitter<void>()

  /**
   *  ordered CCW
   */
  constructor(private floorplan: Floorplan, public corners: Corner[]) {
    this.updateWalls()
    this.updateInteriorCorners()
    this.generatePlane()
  }

  public getCenter2D(): { x: number; y: number } {
    const corners = this.interiorCorners
    if (corners.length === 0) {
      return { x: 0, y: 0 }
    }
    let x = 0
    let y = 0
    for (const corner of corners) {
      x += corner.x
      y += corner.y
    }
    return { x: x / corners.length, y: y / corners.length }
  }

  public getArea(): number {
    const corners = this.interiorCorners
    let area = 0
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % corners.length]
      area += a.x * b.y - b.x * a.y
    }
    return Math.abs(area) / 2
  }

  public getLongAxis(): { x: number; y: number } {
    const corners = this.interiorCorners
    let best = { x: 1, y: 0 }
    let bestLen = 0
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % corners.length]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      if (len > bestLen) {
        bestLen = len
        best = { x: dx / len, y: dy / len }
      }
    }
    return best
  }

  public getUuid(): string {
    const cornerUuids = Utils.map(this.corners, function (c) {
      return c.id
    })
    cornerUuids.sort()
    return cornerUuids.join()
  }

  public fireOnFloorChange(callback: () => void): void {
    this.floorChangeCallbacks.add(callback)
  }

  public getTexture(): { url: string; scale: number } {
    const uuid = this.getUuid()
    const tex = this.floorplan.getFloorTexture(uuid)
    return tex || defaultRoomTexture
  }

  /**
   * textureStretch always true, just an argument for consistency with walls
   */
  // @ts-ignore - setTexture is declared but not used, keeping for future use
  public setTexture(textureUrl: string, textureStretch: boolean, textureScale: number): void {
    const uuid = this.getUuid()
    this.floorplan.setFloorTexture(uuid, textureUrl, textureScale)
    this.floorChangeCallbacks.fire()
  }

  private generatePlane(): void {
    const points: THREE.Vector2[] = []
    this.interiorCorners.forEach((corner) => {
      points.push(new THREE.Vector2(corner.x, corner.y))
    })
    const shape = new THREE.Shape(points)
    const geometry = new THREE.ShapeGeometry(shape)
    this.floorPlane = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        colorWrite: false
      })
    )
    this.floorPlane.visible = false
    this.floorPlane.rotation.set(Math.PI / 2, 0, 0)
    this.floorPlane.position.y = -0.4
    ;(<any>this.floorPlane).room = this // js monkey patch
  }

  // @ts-ignore - cycleIndex is declared but not used, keeping for future use
  private cycleIndex(index: number): number {
    if (index < 0) {
      return (index += this.corners.length)
    } else {
      return index % this.corners.length
    }
  }

  private updateInteriorCorners(): void {
    if (!this.edgePointer) {
      return
    }
    let edge = this.edgePointer
    while (true) {
      this.interiorCorners.push(edge.interiorStart())
      edge.generatePlane()
      if (edge.next === this.edgePointer) {
        break
      } else if (edge.next) {
        edge = edge.next
      } else {
        break
      }
    }
  }

  /**
   * Populates each wall's half edge relating to this room
   * this creates a fancy doubly connected edge list (DCEL)
   */
  private updateWalls(): void {
    let prevEdge: HalfEdge | null = null
    let firstEdge: HalfEdge | null = null

    for (let i = 0; i < this.corners.length; i++) {
      const firstCorner = this.corners[i]
      const secondCorner = this.corners[(i + 1) % this.corners.length]

      // find if wall is heading in that direction
      const wallTo = firstCorner.wallTo(secondCorner)
      const wallFrom = firstCorner.wallFrom(secondCorner)

      let edge: HalfEdge | null = null

      if (wallTo) {
        edge = new HalfEdge(this, wallTo, true)
      } else if (wallFrom) {
        edge = new HalfEdge(this, wallFrom, false)
      } else {
        // something horrible has happened
        console.log('corners arent connected by a wall, uh oh')
        continue
      }

      if (i == 0) {
        firstEdge = edge
      } else {
        edge.prev = prevEdge
        if (prevEdge) {
          prevEdge.next = edge
        }
        if (i + 1 == this.corners.length && firstEdge) {
          firstEdge.prev = edge
          edge.next = firstEdge
        }
      }
      prevEdge = edge
    }

    // hold on to an edge reference
    this.edgePointer = firstEdge
  }
}
