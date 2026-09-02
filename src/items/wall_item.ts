import * as THREE from 'three'
import { Utils } from '../core/utils'
import { HalfEdge } from '../model/half_edge'
import type { Model } from '../model/model'
import {
  collinearRun,
  ensureOpeningWallAt,
  fillOpening,
  OPENING_SNAP_CM,
  sharesCollinearRun,
  slideOpeningTo,
  wallLength
} from '../model/opening-wall'
import { Item } from './item'
import { Metadata } from './metadata'

/**
 * A Wall Item is an entity to be placed related to a wall.
 */
export abstract class WallItem extends Item {
  /** The currently applied wall edge. */
  protected currentWallEdge: HalfEdge | null = null
  /* TODO:
       This caused a huge headache.
       HalfEdges get destroyed/created every time floorplan is edited.
       This item should store a reference to a wall and front/back,
       and grab its edge reference dynamically whenever it needs it.
     */

  /** Store which edge (front/back) this item is on */
  protected isFrontEdge = true

  /** used for finding rotations */
  private refVec = new THREE.Vector2(0, 1.0)

  /** */
  private wallOffsetScalar = 0

  /** */
  private sizeX = 0

  /** */
  private sizeY = 0

  /** */
  protected addToWall = false

  /** */
  protected boundToFloor = false

  /** */
  protected frontVisible = false

  /** */
  protected backVisible = false

  /** Store bound function reference for proper callback removal */
  private readonly boundRemoveFromScene: () => void

  constructor(
    model: Model,
    metadata: Metadata,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    position?: THREE.Vector3,
    rotation?: number,
    scale?: THREE.Vector3
  ) {
    super(model, metadata, geometry, material, position, rotation, scale)

    this.allowRotate = false

    // Bind function once and store reference
    this.boundRemoveFromScene = this.removeFromScene.bind(this)
  }

  /** Get the closet wall edge.
   * @returns The wall edge.
   */
  public closestWallEdge(): HalfEdge | null {
    return this.nearestEdgeAt(this.position.x, this.position.z)
  }

  protected nearestEdgeAt(x: number, z: number, maxDist = Infinity): HalfEdge | null {
    let wallEdge: HalfEdge | null = null
    let minDistance = maxDist
    for (const edge of this.model.floorplan.wallEdges()) {
      const distance = edge.distanceTo(x, z)
      if (distance < minDistance) {
        minDistance = distance
        wallEdge = edge
      }
    }
    return wallEdge
  }

  /** */
  public removed() {
    const wall = this.currentWallEdge?.wall
    if (this.currentWallEdge != null && this.addToWall) {
      Utils.removeValue(this.currentWallEdge.wall.items, this)
      this.redrawWall()
    }
    if (this.addToWall && wall?.opening) {
      fillOpening(this.model.floorplan, wall, { skipItems: true })
    }
  }

  /** */
  private redrawWall() {
    if (this.addToWall && this.currentWallEdge) {
      this.currentWallEdge.wall.fireRedraw()
    }
  }

  /** */
  // @ts-ignore - updateEdgeVisibility is declared but not used, keeping for future use
  private updateEdgeVisibility(visible: boolean, front: boolean) {
    if (front) {
      this.frontVisible = visible
    } else {
      this.backVisible = visible
    }
    this.visible = this.frontVisible || this.backVisible
  }

  /** */
  private updateSize() {
    this.wallOffsetScalar =
      ((this.geometry.boundingBox!.max.z - this.geometry.boundingBox!.min.z) * this.scale.z) / 2.0
    this.sizeX =
      (this.geometry.boundingBox!.max.x - this.geometry.boundingBox!.min.x) * this.scale.x
    this.sizeY =
      (this.geometry.boundingBox!.max.y - this.geometry.boundingBox!.min.y) * this.scale.y
  }

  /** */
  public resized(): void {
    if (this.boundToFloor) {
      this.position.y =
        0.5 * (this.geometry.boundingBox!.max.y - this.geometry.boundingBox!.min.y) * this.scale.y +
        0.01
    }

    this.updateSize()
    this.redrawWall()
  }

  /** */
  public placeInRoom(): void {
    this.updateSize()
    if (!this.position_set) {
      let edge = this.closestWallEdge()
      if (!edge) {
        const origin = this.model.floorplan.getCenter()
        this.position.x = origin.x
        this.position.z = origin.z
        edge = this.snapOrCreateOpeningAt(origin.x, origin.z)
      }
      if (!edge) return
      const center = edge.interiorCenter()
      this.attachToEdge(edge, new THREE.Vector3(center.x, edge.wall.height / 2.0, center.y))
      return
    }
    const edge = this.snapOrCreateOpeningAt(this.position.x, this.position.z)
    if (!edge) return
    this.attachToEdge(edge, this.position.clone())
  }

  /** */
  public moveToPosition(vec3: THREE.Vector3, intersection: THREE.Intersection | null): void {
    const hitEdge = (intersection?.object as { edge?: HalfEdge } | undefined)?.edge
    const current = this.currentWallEdge
    if (current?.wall.opening) {
      const along = hitEdge && sharesCollinearRun(current.wall, hitEdge.wall) ? hitEdge : current
      if (along) {
        this.attachToEdge(current, vec3)
        return
      }
    }
    const edge = hitEdge ?? this.nearestEdgeAt(vec3.x, vec3.z, OPENING_SNAP_CM)
    if (edge) {
      this.attachToEdge(edge, vec3)
      return
    }
    this.position.x = vec3.x
    this.position.z = vec3.z
    if (this.boundToFloor && this.geometry.boundingBox) {
      this.position.y =
        0.5 * (this.geometry.boundingBox.max.y - this.geometry.boundingBox.min.y) * this.scale.y + 0.01
    }
  }

  public commitToWallOrOpening(): void {
    if (this.currentWallEdge?.wall.opening) {
      slideOpeningTo(this.currentWallEdge.wall, this.position.x, this.position.z)
      this.model.floorplan.update()
      this.updateWallEdgeReference()
      const edge = this.currentWallEdge ?? this.nearestEdgeAt(this.position.x, this.position.z)
      if (edge) this.attachToEdge(edge, this.position.clone())
      return
    }
    const edge = this.snapOrCreateOpeningAt(this.position.x, this.position.z)
    if (!edge) return
    this.attachToEdge(edge, this.position.clone())
  }

  protected snapOrCreateOpeningAt(x: number, z: number): HalfEdge | null {
    const nearby = this.nearestEdgeAt(x, z, OPENING_SNAP_CM)
    if (nearby) return nearby
    if (!this.addToWall) return this.closestWallEdge()
    ensureOpeningWallAt(this.model.floorplan, x, z, Math.max(this.sizeX, 80))
    return this.closestWallEdge()
  }

  protected attachToEdge(edge: HalfEdge, vec3: THREE.Vector3): void {
    this.changeWallEdge(edge)
    this.boundMove(vec3)
    this.position.copy(vec3)
    this.redrawWall()
  }

  /** */
  protected getWallOffset() {
    return this.wallOffsetScalar
  }

  /** */
  private changeWallEdge(wallEdge: HalfEdge): void {
    if (this.currentWallEdge != null) {
      if (this.addToWall) {
        Utils.removeValue(this.currentWallEdge.wall.items, this)
        this.redrawWall()
      } else {
        Utils.removeValue(this.currentWallEdge.wall.onItems, this)
      }
    }

    // handle subscription to wall being removed
    if (this.currentWallEdge != null) {
      this.currentWallEdge.wall.dontFireOnDelete(this.boundRemoveFromScene)
    }
    wallEdge.wall.fireOnDelete(this.boundRemoveFromScene)

    // find angle between wall normals
    const normal2 = new THREE.Vector2()
    // Note: BufferGeometry doesn't have faces, compute normal from wall edge instead
    const start = wallEdge.interiorStart()
    const end = wallEdge.interiorEnd()
    const dx = end.x - start.x
    const dy = end.y - start.y
    // Normal is perpendicular to the wall edge
    normal2.x = -dy
    normal2.y = dx
    normal2.normalize()

    const angle = Utils.angle(this.refVec.x, this.refVec.y, normal2.x, normal2.y)
    this.rotation.y = angle

    // update currentWall
    this.currentWallEdge = wallEdge
    this.isFrontEdge = wallEdge.front
    if (this.addToWall) {
      wallEdge.wall.items.push(this)
      this.redrawWall()
    } else {
      wallEdge.wall.onItems.push(this)
    }
  }

  /** Update wall edge reference after floorplan updates recreate HalfEdges */
  public updateWallEdgeReference(): void {
    if (this.currentWallEdge == null) {
      return
    }

    const wall = this.currentWallEdge.wall
    const newEdge = this.isFrontEdge ? wall.frontEdge : wall.backEdge

    if (newEdge && newEdge !== this.currentWallEdge) {
      this.currentWallEdge = newEdge
    }
  }

  /** Returns an array of planes to use other than the ground plane
   * for passing intersection to clickPressed and clickDragged */
  public customIntersectionPlanes(): THREE.Mesh[] {
    return this.model.floorplan.wallEdgePlanes()
  }

  /** takes the move vec3, and makes sure object stays bounded on plane */
  private boundMove(vec3: THREE.Vector3): void {
    const tolerance = 1
    const edge = this.currentWallEdge!
    vec3.applyMatrix4(edge.interiorTransform)

    const run = edge.wall.opening ? collinearRun(edge.wall) : null
    const openingLen = edge.interiorDistance()
    const span = run && run.length > wallLength(edge.wall) + 1 ? run : null
    const minX = span
      ? this.sizeX / 2.0 + tolerance - span.shift
      : this.sizeX / 2.0 + tolerance
    const maxX = span
      ? span.length - this.sizeX / 2.0 - tolerance - span.shift
      : openingLen - this.sizeX / 2.0 - tolerance

    if (minX <= maxX) {
      if (vec3.x < minX) {
        vec3.x = minX
      } else if (vec3.x > maxX) {
        vec3.x = maxX
      }
    } else if (!span) {
      vec3.x = openingLen / 2.0
    }

    if (this.boundToFloor) {
      vec3.y =
        0.5 * (this.geometry.boundingBox!.max.y - this.geometry.boundingBox!.min.y) * this.scale.y +
        0.01
    } else {
      if (vec3.y < this.sizeY / 2.0 + tolerance) {
        vec3.y = this.sizeY / 2.0 + tolerance
      } else if (vec3.y > edge.height - this.sizeY / 2.0 - tolerance) {
        vec3.y = edge.height - this.sizeY / 2.0 - tolerance
      }
    }

    vec3.z = this.getWallOffset()

    vec3.applyMatrix4(edge.invInteriorTransform)
  }

  /** Wall items are always in a valid position when attached to a wall */
  public isValidPosition(vec3: THREE.Vector3): boolean {
    return true
  }
}
