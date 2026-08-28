import * as THREE from 'three'

export class Skybox {
  private readonly scene: THREE.Scene
  private readonly bottomColor: number
  private readonly sphereRadius = 4000
  private readonly widthSegments = 32
  private readonly heightSegments = 15

  /**
   * @param scene - THREE.Scene to add skybox to
   * @param _topColor - unused; kept for call-site compatibility
   * @param bottomColor - Sky color (hex number, e.g., 0xF9F5F1).
   */
  constructor(scene: THREE.Scene, _topColor = 0xffffff, bottomColor = 0xf9f5f1) {
    this.scene = scene
    this.bottomColor = bottomColor
    this.init()
  }

  private init(): void {
    const skyGeo = new THREE.SphereGeometry(
      this.sphereRadius,
      this.widthSegments,
      this.heightSegments
    )
    const skyMat = new THREE.MeshBasicMaterial({
      color: this.bottomColor,
      side: THREE.BackSide,
      depthWrite: false
    })
    const sky = new THREE.Mesh(skyGeo, skyMat)
    this.scene.add(sky)
  }
}
