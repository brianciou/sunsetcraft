import * as THREE from 'three'
import { SUN_DIR } from './config.js'

// A small flock of silhouette birds drifting between the player and the sun.
const COUNT = 7

function wingGeometry(side) {
  const geo = new THREE.BufferGeometry()
  const s = side // +1 right, -1 left
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.12,
    s * 1.15, 0, -0.42,
    s * 1.05, 0, 0.32,
  ], 3))
  geo.computeVertexNormals()
  return geo
}

export class Birds {
  constructor(scene) {
    this.group = new THREE.Group()
    scene.add(this.group)
    const mat = new THREE.MeshBasicMaterial({ color: 0x241a30, side: THREE.DoubleSide })
    this.birds = []
    for (let i = 0; i < COUNT; i++) {
      const bird = new THREE.Group()
      const wl = new THREE.Mesh(wingGeometry(-1), mat)
      const wr = new THREE.Mesh(wingGeometry(1), mat)
      bird.add(wl)
      bird.add(wr)
      const scale = 0.8 + Math.random() * 0.55
      bird.scale.setScalar(scale)
      this.group.add(bird)
      this.birds.push({
        node: bird, wl, wr,
        radius: 12 + Math.random() * 26,
        speed: (0.05 + Math.random() * 0.04) * (Math.random() < 0.5 ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
        bob: 2 + Math.random() * 4,
        flapSpeed: 7 + Math.random() * 3,
        flapPhase: Math.random() * Math.PI * 2,
        glidePhase: Math.random() * Math.PI * 2,
      })
    }
    this._target = new THREE.Vector3()
  }

  update(t, playerPos) {
    // flock center sits sunward of the player, above the horizon line
    const cx = playerPos.x + SUN_DIR.x * 110
    const cz = playerPos.z + SUN_DIR.z * 110
    const cy = Math.min(95, Math.max(46, playerPos.y + 16))
    // ease the group toward the target so it doesn't snap while flying
    this._target.set(cx, cy, cz)
    if (!this._init) { this.group.position.copy(this._target); this._init = true }
    else this.group.position.lerp(this._target, 0.005)

    for (const b of this.birds) {
      const a = t * b.speed + b.phase
      const px = Math.cos(a) * b.radius
      const pz = Math.sin(a) * b.radius
      const py = Math.sin(a * 0.7 + b.phase) * b.bob
      b.node.position.set(px, py, pz)
      // face direction of travel (tangent)
      const dirSign = Math.sign(b.speed)
      b.node.rotation.y = -a - dirSign * Math.PI / 2
      // flap with occasional gliding pauses
      const amp = 0.18 + 0.55 * Math.max(0, Math.sin(t * 0.21 + b.glidePhase))
      const flap = Math.sin(t * b.flapSpeed + b.flapPhase) * amp
      b.wl.rotation.z = flap
      b.wr.rotation.z = -flap
    }
  }
}
