import * as THREE from 'three'
import { BLOCKS } from './blocks.js'

const ATLAS_COLS = 4
const TILE_UV = 1 / ATLAS_COLS
const INSET = 0.5 / 16

// First-person held block, attached to the camera.
export class Hand {
  constructor(camera, scene, atlasTexture) {
    scene.add(camera) // so camera children get world matrices
    // unlit but warm-tinted so it stays readable against the dusk
    this.material = new THREE.MeshBasicMaterial({ map: atlasTexture, color: 0xd9b896, fog: false })
    this.mesh = new THREE.Mesh(this.buildGeometry(1), this.material)
    this.mesh.position.set(0.42, -0.34, -0.78)
    this.mesh.rotation.set(0.18, Math.PI / 5, 0)
    this.mesh.renderOrder = 5
    camera.add(this.mesh)
    this.swingT = 1 // 1 = idle
  }

  // BoxGeometry with per-face atlas UVs; three's box face order: +x, -x, +y, -y, +z, -z
  buildGeometry(blockId) {
    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2)
    const tiles = BLOCKS[blockId].tiles // [-x, +x, -y, +y, -z, +z]
    const order = [tiles[1], tiles[0], tiles[3], tiles[2], tiles[5], tiles[4]]
    const uv = geo.attributes.uv
    for (let f = 0; f < 6; f++) {
      const tile = order[f]
      const tu = (tile % ATLAS_COLS) * TILE_UV
      const tv = 1 - TILE_UV - Math.floor(tile / ATLAS_COLS) * TILE_UV
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v
        uv.setXY(
          i,
          tu + (INSET + uv.getX(i) * (1 - 2 * INSET)) * TILE_UV,
          tv + (INSET + uv.getY(i) * (1 - 2 * INSET)) * TILE_UV
        )
      }
    }
    uv.needsUpdate = true
    return geo
  }

  setBlock(blockId) {
    this.mesh.geometry.dispose()
    this.mesh.geometry = this.buildGeometry(blockId)
  }

  swing() { this.swingT = 0 }

  update(dt) {
    this.swingT = Math.min(1, this.swingT + dt * 3.2)
    const t = this.swingT
    const arc = Math.sin(t * Math.PI) // 0 -> 1 -> 0
    this.mesh.position.set(
      0.42 - arc * 0.16,
      -0.34 - arc * 0.09,
      -0.78 - arc * 0.14
    )
    this.mesh.rotation.set(0.18 - arc * 0.9, Math.PI / 5 - arc * 0.5, -arc * 0.25)
  }
}
