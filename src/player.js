import * as THREE from 'three'
import { GRAVITY, WATER_Y, SPAWN, SPAWN_YAW, SPAWN_PITCH } from './config.js'
import { AIR } from './blocks.js'

const HALF = 0.32          // half-width of the player AABB
const HEIGHT = 1.8
const EYE = 1.62

const WALK_SPEED = 5.4
const SPRINT_SPEED = 8.4
const SWIM_SPEED = 3.6
const JUMP_VEL = 8.2

export class Player {
  constructor(camera, world) {
    this.camera = camera
    this.world = world
    this.pos = SPAWN.clone()         // feet position
    this.vel = new THREE.Vector3()
    this.yaw = SPAWN_YAW
    this.pitch = SPAWN_PITCH
    this.roll = 0
    this.onGround = false
    this.gliding = true
    this.glideSpeed = 15
    this.keys = new Set()
    this.lastSpaceTime = -1
    this.bobPhase = 0
    this.bobAmount = 0
    this.fov = 78
    this.frozen = true               // until first pointer lock
    this.onModeChange = null

    camera.rotation.order = 'YXZ'
    this.syncCamera(0)
  }

  handleMouse(dx, dy) {
    this.yaw -= dx * 0.0023
    this.pitch -= dy * 0.0023
    const lim = Math.PI / 2 - 0.01
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch))
  }

  keyDown(code) {
    this.keys.add(code)
    if (code === 'Space') {
      const now = performance.now()
      if (now - this.lastSpaceTime < 280) {
        this.toggleGlide()
        this.lastSpaceTime = -1
      } else {
        this.lastSpaceTime = now
      }
    }
  }

  keyUp(code) { this.keys.delete(code) }

  toggleGlide() {
    if (this.gliding) {
      this.setGliding(false)
    } else {
      if (this.onGround || this.feetInWater()) this.vel.y = 10.5 // hop into the air first
      this.setGliding(true)
      this.glideGrace = 0.8 // seconds before landing/splash checks re-arm
      this.glideSpeed = Math.max(12, this.vel.length())
    }
  }

  setGliding(g) {
    if (this.gliding === g) return
    this.gliding = g
    if (this.onModeChange) this.onModeChange(g ? 'gliding' : 'walking')
  }

  lookDir() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    )
  }

  inWater() {
    const eyeY = this.pos.y + EYE
    return eyeY < WATER_Y + 0.1 &&
      this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z)) === AIR &&
      this.pos.y + 0.4 < WATER_Y
  }

  feetInWater() {
    return this.pos.y + 0.2 < WATER_Y &&
      this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z)) === AIR
  }

  update(dt) {
    if (this.frozen) { this.syncCamera(dt); return }

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x)
    let ix = 0, iz = 0
    if (this.keys.has('KeyW')) iz += 1
    if (this.keys.has('KeyS')) iz -= 1
    if (this.keys.has('KeyD')) ix += 1
    if (this.keys.has('KeyA')) ix -= 1

    const swimming = this.feetInWater()

    if (this.gliding) {
      // --- glide: pitch trades altitude for speed ---
      const look = this.lookDir()
      this.glideSpeed += (-look.y * 13.5 - (this.glideSpeed - 11.5) * 0.45) * dt
      this.glideSpeed = Math.max(7, Math.min(42, this.glideSpeed))
      const target = look.clone().multiplyScalar(this.glideSpeed)
      target.y -= 2.2  // constant gentle sink so level flight descends slowly
      // strafe nudge
      target.addScaledVector(right, ix * 4.5)
      this.vel.lerp(target, 1 - Math.exp(-4.2 * dt))

      this.move(dt)
      // touched down or splashed? (not during takeoff grace)
      this.glideGrace = Math.max(0, (this.glideGrace || 0) - dt)
      if (this.glideGrace <= 0) {
        if (this.onGround) this.setGliding(false)
        if (swimming) { this.setGliding(false); this.vel.multiplyScalar(0.25) }
      }
      // bank into turns (yaw rate measured across frames)
      const yawVel = (this.yaw - (this._prevYaw ?? this.yaw)) / Math.max(dt, 1e-4)
      const targetRoll = Math.max(-0.35, Math.min(0.35, -yawVel * 0.09))
      this.roll += (targetRoll - this.roll) * Math.min(1, dt * 5)
    } else if (swimming) {
      // --- swim ---
      const wish = new THREE.Vector3()
      wish.addScaledVector(fwd, iz).addScaledVector(right, ix)
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(SWIM_SPEED)
      this.vel.x += (wish.x - this.vel.x) * Math.min(1, dt * 6)
      this.vel.z += (wish.z - this.vel.z) * Math.min(1, dt * 6)
      this.vel.y -= GRAVITY * 0.18 * dt          // soft sink
      this.vel.y *= 1 - Math.min(1, dt * 2.2)    // drag
      if (this.keys.has('Space')) this.vel.y += 26 * dt
      if (this.keys.has('ShiftLeft')) this.vel.y -= 14 * dt
      this.vel.y = Math.max(-4, Math.min(5.5, this.vel.y))
      this.move(dt)
    } else {
      // --- walk ---
      const sprint = this.keys.has('ShiftLeft')
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED
      const wish = new THREE.Vector3()
      wish.addScaledVector(fwd, iz).addScaledVector(right, ix)
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed)
      const accel = this.onGround ? 11 : 3.2
      this.vel.x += (wish.x - this.vel.x) * Math.min(1, dt * accel)
      this.vel.z += (wish.z - this.vel.z) * Math.min(1, dt * accel)
      this.vel.y -= GRAVITY * dt
      if (this.keys.has('Space') && this.onGround) this.vel.y = JUMP_VEL
      this.move(dt)
    }

    // camera shake-free roll decay when not gliding
    if (!this.gliding) this.roll *= 1 - Math.min(1, dt * 8)

    // FOV: widen with glide speed / sprint
    const targetFov = 78 + (this.gliding ? this.glideSpeed * 0.42
      : (this.keys.has('ShiftLeft') && !swimming ? 6 : 0))
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 5)

    // head bob
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    if (this.onGround && hSpeed > 0.5) {
      this.bobPhase += dt * (4 + hSpeed * 1.1)
      this.bobAmount += (1 - this.bobAmount) * Math.min(1, dt * 6)
    } else {
      this.bobAmount *= 1 - Math.min(1, dt * 5)
    }

    this._prevYaw = this.yaw
    this.syncCamera(dt)
  }

  syncCamera(dt) {
    const bobY = Math.sin(this.bobPhase * 2) * 0.05 * this.bobAmount
    const bobX = Math.sin(this.bobPhase) * 0.04 * this.bobAmount
    this.camera.position.set(
      this.pos.x + bobX * Math.cos(this.yaw),
      this.pos.y + EYE + bobY,
      this.pos.z - bobX * Math.sin(this.yaw)
    )
    this.camera.rotation.set(this.pitch, this.yaw, this.roll)
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov
      this.camera.updateProjectionMatrix()
    }
  }

  move(dt) {
    this.onGround = false
    const d = this.vel.clone().multiplyScalar(dt)
    // resolve axis by axis to slide along walls
    this.moveAxis('y', d.y)
    this.moveAxis('x', d.x)
    this.moveAxis('z', d.z)
  }

  moveAxis(axis, amount) {
    if (amount === 0) return
    this.pos[axis] += amount
    const min = new THREE.Vector3(this.pos.x - HALF, this.pos.y, this.pos.z - HALF)
    const max = new THREE.Vector3(this.pos.x + HALF, this.pos.y + HEIGHT, this.pos.z + HALF)

    for (let y = Math.floor(min.y); y <= Math.floor(max.y - 1e-4); y++) {
      for (let z = Math.floor(min.z); z <= Math.floor(max.z - 1e-4); z++) {
        for (let x = Math.floor(min.x); x <= Math.floor(max.x - 1e-4); x++) {
          if (this.world.getBlock(x, y, z) === AIR) continue
          // overlap — push back along this axis
          if (axis === 'y') {
            if (amount < 0) {
              this.pos.y = y + 1
              this.onGround = true
            } else {
              this.pos.y = y - HEIGHT - 1e-3
            }
            this.vel.y = 0
          } else if (axis === 'x') {
            this.pos.x = amount > 0 ? x - HALF - 1e-3 : x + 1 + HALF + 1e-3
            this.vel.x = 0
          } else {
            this.pos.z = amount > 0 ? z - HALF - 1e-3 : z + 1 + HALF + 1e-3
            this.vel.z = 0
          }
          return this.moveAxis(axis, 0) // positions changed; re-scan not needed
        }
      }
    }
  }

  // Would a block placed at (x, y, z) intersect the player AABB?
  intersectsBlock(x, y, z) {
    return (
      x + 1 > this.pos.x - HALF && x < this.pos.x + HALF &&
      z + 1 > this.pos.z - HALF && z < this.pos.z + HALF &&
      y + 1 > this.pos.y && y < this.pos.y + HEIGHT
    )
  }
}
