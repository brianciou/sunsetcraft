import * as THREE from 'three'
import { BLOCKS } from './blocks.js'

const TILE = 16
const COLS = 4

// Average color per atlas tile, for tinting break particles
function tileAverages(atlasCanvas) {
  const ctx = atlasCanvas.getContext('2d')
  const avgs = []
  for (let t = 0; t < COLS * COLS; t++) {
    const d = ctx.getImageData((t % COLS) * TILE, Math.floor(t / COLS) * TILE, TILE, TILE).data
    let r = 0, g = 0, b = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
    const n = d.length / 4
    avgs.push(new THREE.Color(r / n / 255, g / n / 255, b / n / 255))
  }
  return avgs
}

export class Particles {
  constructor(scene, atlasCanvas) {
    this.scene = scene
    this.avgs = tileAverages(atlasCanvas)
    this.bursts = []
    this.geo = new THREE.BoxGeometry(0.12, 0.12, 0.12)
  }

  burst(x, y, z, blockId) {
    const def = BLOCKS[blockId]
    if (!def) return
    const color = this.avgs[def.tiles[0]]
    const mat = new THREE.MeshLambertMaterial({ color })
    const count = 14
    const mesh = new THREE.InstancedMesh(this.geo, mat, count)
    const vels = []
    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      dummy.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6)
      dummy.rotation.set(Math.random() * 3, Math.random() * 3, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      vels.push(new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 4))
    }
    this.scene.add(mesh)
    this.bursts.push({ mesh, vels, age: 0, life: 0.75 })
  }

  update(dt) {
    const dummy = new THREE.Object3D()
    const m = new THREE.Matrix4()
    for (let b = this.bursts.length - 1; b >= 0; b--) {
      const burst = this.bursts[b]
      burst.age += dt
      if (burst.age >= burst.life) {
        this.scene.remove(burst.mesh)
        burst.mesh.material.dispose()
        burst.mesh.dispose()
        this.bursts.splice(b, 1)
        continue
      }
      const s = 1 - (burst.age / burst.life) ** 2
      for (let i = 0; i < burst.vels.length; i++) {
        burst.mesh.getMatrixAt(i, m)
        dummy.position.setFromMatrixPosition(m)
        const v = burst.vels[i]
        v.y -= 14 * dt
        dummy.position.addScaledVector(v, dt)
        dummy.scale.setScalar(s)
        dummy.rotation.set(v.x, v.y * 0.3, 0)
        dummy.updateMatrix()
        burst.mesh.setMatrixAt(i, dummy.matrix)
      }
      burst.mesh.instanceMatrix.needsUpdate = true
    }
  }
}
