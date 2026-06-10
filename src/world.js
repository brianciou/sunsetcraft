import * as THREE from 'three'
import { CHUNK, WORLD_H, VIEW_DIST, UNLOAD_DIST } from './config.js'
import { BLOCKS, AIR } from './blocks.js'
import { generateChunkData, hash2 } from './terrain.js'

const ATLAS_COLS = 4
const TILE_UV = 1 / ATLAS_COLS
const INSET = 0.5 / 16 // half-texel inside each 16px tile

// face order: [-x, +x, -y, +y, -z, +z] — matches BLOCKS[].tiles
const FACES = [
  { dir: [-1, 0, 0], corners: [
    { pos: [0, 1, 0], uv: [0, 1] }, { pos: [0, 0, 0], uv: [0, 0] },
    { pos: [0, 1, 1], uv: [1, 1] }, { pos: [0, 0, 1], uv: [1, 0] } ] },
  { dir: [1, 0, 0], corners: [
    { pos: [1, 1, 1], uv: [0, 1] }, { pos: [1, 0, 1], uv: [0, 0] },
    { pos: [1, 1, 0], uv: [1, 1] }, { pos: [1, 0, 0], uv: [1, 0] } ] },
  { dir: [0, -1, 0], corners: [
    { pos: [1, 0, 1], uv: [1, 0] }, { pos: [0, 0, 1], uv: [0, 0] },
    { pos: [1, 0, 0], uv: [1, 1] }, { pos: [0, 0, 0], uv: [0, 1] } ] },
  { dir: [0, 1, 0], corners: [
    { pos: [0, 1, 1], uv: [1, 1] }, { pos: [1, 1, 1], uv: [0, 1] },
    { pos: [0, 1, 0], uv: [1, 0] }, { pos: [1, 1, 0], uv: [0, 0] } ] },
  { dir: [0, 0, -1], corners: [
    { pos: [1, 0, 0], uv: [0, 0] }, { pos: [0, 0, 0], uv: [1, 0] },
    { pos: [1, 1, 0], uv: [0, 1] }, { pos: [0, 1, 0], uv: [1, 1] } ] },
  { dir: [0, 0, 1], corners: [
    { pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 1], uv: [1, 0] },
    { pos: [0, 1, 1], uv: [0, 1] }, { pos: [1, 1, 1], uv: [1, 1] } ] },
]

const AO_LEVELS = [0.42, 0.62, 0.81, 1.0]

const dataIdx = (x, y, z) => x + z * CHUNK + y * CHUNK * CHUNK

export class World {
  constructor(scene, material) {
    this.scene = scene
    this.material = material
    this.chunkData = new Map()   // "cx,cz" -> Uint8Array
    this.meshes = new Map()      // "cx,cz" -> THREE.Mesh
    this.edits = new Map()       // "cx,cz" -> Map(blockIndex -> id), survives unload
    this.dirty = new Set()
  }

  key(cx, cz) { return cx + ',' + cz }

  ensureData(cx, cz) {
    const k = this.key(cx, cz)
    let data = this.chunkData.get(k)
    if (!data) {
      data = generateChunkData(cx, cz)
      const edits = this.edits.get(k)
      if (edits) for (const [i, id] of edits) data[i] = id
      this.chunkData.set(k, data)
    }
    return data
  }

  getBlock(x, y, z) {
    if (y < 0) return 1
    if (y >= WORLD_H) return AIR
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK)
    const data = this.ensureData(cx, cz)
    return data[dataIdx(x - cx * CHUNK, y, z - cz * CHUNK)]
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_H) return
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK)
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK
    const k = this.key(cx, cz)
    const data = this.ensureData(cx, cz)
    const i = dataIdx(lx, y, lz)
    if (data[i] === id) return
    data[i] = id
    if (!this.edits.has(k)) this.edits.set(k, new Map())
    this.edits.get(k).set(i, id)

    this.dirty.add(k)
    if (lx === 0) this.dirty.add(this.key(cx - 1, cz))
    if (lx === CHUNK - 1) this.dirty.add(this.key(cx + 1, cz))
    if (lz === 0) this.dirty.add(this.key(cx, cz - 1))
    if (lz === CHUNK - 1) this.dirty.add(this.key(cx, cz + 1))
    this.rebuildDirty()
  }

  rebuildDirty() {
    for (const k of this.dirty) {
      if (this.meshes.has(k)) {
        const [cx, cz] = k.split(',').map(Number)
        this.buildChunkMesh(cx, cz)
      }
    }
    this.dirty.clear()
  }

  // Load/unload chunks around the player; budgeted per frame
  update(playerPos, budget = 3) {
    const pcx = Math.floor(playerPos.x / CHUNK)
    const pcz = Math.floor(playerPos.z / CHUNK)

    let built = 0
    outer:
    for (let r = 0; r <= VIEW_DIST; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const cx = pcx + dx, cz = pcz + dz
          if (this.meshes.has(this.key(cx, cz))) continue
          this.buildChunkMesh(cx, cz)
          if (++built >= budget) break outer
        }
      }
    }

    if (built === 0) {
      for (const [k, mesh] of this.meshes) {
        const [cx, cz] = k.split(',').map(Number)
        if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > UNLOAD_DIST) {
          this.scene.remove(mesh)
          mesh.geometry.dispose()
          this.meshes.delete(k)
          this.chunkData.delete(k)
        }
      }
    }
    return built
  }

  buildChunkMesh(cx, cz) {
    const k = this.key(cx, cz)
    // data for this chunk + neighbors (mesher peeks across borders)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) this.ensureData(cx + dx, cz + dz)

    const data = this.chunkData.get(k)
    const x0 = cx * CHUNK, z0 = cz * CHUNK

    const positions = [], normals = [], uvs = [], colors = [], indices = []
    const solid = (x, y, z) => this.getBlock(x, y, z) !== AIR

    for (let y = 0; y < WORLD_H; y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const id = data[dataIdx(x, y, z)]
          if (id === AIR) continue
          const def = BLOCKS[id]
          const wx = x0 + x, wz = z0 + z
          // subtle per-block tint variation
          const tint = 0.94 + hash2(wx * 7 + y, wz * 13 - y) * 0.06

          for (let f = 0; f < 6; f++) {
            const face = FACES[f]
            const nx = wx + face.dir[0], ny = y + face.dir[1], nz = wz + face.dir[2]
            if (ny >= 0 && ny < WORLD_H && this.getBlock(nx, ny, nz) !== AIR) continue
            if (ny < 0) continue

            const tile = def.tiles[f]
            const tu = (tile % ATLAS_COLS) * TILE_UV
            const tv = 1 - TILE_UV - Math.floor(tile / ATLAS_COLS) * TILE_UV

            // axes for AO: the two axes perpendicular to the face normal
            const nAxis = face.dir[0] !== 0 ? 0 : face.dir[1] !== 0 ? 1 : 2
            const uAxis = nAxis === 0 ? 1 : 0
            const vAxis = nAxis === 2 ? 1 : 2
            const base = [nx, ny, nz]

            const ndx = positions.length / 3
            const ao = []
            for (const c of face.corners) {
              positions.push(x + c.pos[0], y + c.pos[1], z + c.pos[2])
              normals.push(face.dir[0], face.dir[1], face.dir[2])
              uvs.push(
                tu + (INSET + c.uv[0] * (1 - 2 * INSET)) * TILE_UV,
                tv + (INSET + c.uv[1] * (1 - 2 * INSET)) * TILE_UV
              )
              const du = c.pos[uAxis] ? 1 : -1
              const dv = c.pos[vAxis] ? 1 : -1
              const s1c = [...base]; s1c[uAxis] += du
              const s2c = [...base]; s2c[vAxis] += dv
              const cc = [...base]; cc[uAxis] += du; cc[vAxis] += dv
              const s1 = solid(s1c[0], s1c[1], s1c[2]) ? 1 : 0
              const s2 = solid(s2c[0], s2c[1], s2c[2]) ? 1 : 0
              const co = solid(cc[0], cc[1], cc[2]) ? 1 : 0
              const a = s1 && s2 ? 0 : 3 - (s1 + s2 + co)
              ao.push(a)
              const v = AO_LEVELS[a] * tint
              colors.push(v, v, v)
            }
            // flip quad diagonal to avoid AO anisotropy
            if (ao[1] + ao[2] >= ao[0] + ao[3]) {
              indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3)
            } else {
              indices.push(ndx + 1, ndx + 3, ndx, ndx, ndx + 3, ndx + 2)
            }
          }
        }
      }
    }

    const old = this.meshes.get(k)
    if (old) {
      this.scene.remove(old)
      old.geometry.dispose()
      this.meshes.delete(k)
    }
    if (indices.length === 0) {
      // register an empty placeholder so update() doesn't retry forever
      const empty = new THREE.Mesh(new THREE.BufferGeometry(), this.material)
      empty.visible = false
      this.meshes.set(k, empty)
      return
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(CHUNK / 2, WORLD_H / 2, CHUNK / 2),
      Math.sqrt(2 * (CHUNK / 2) ** 2 + (WORLD_H / 2) ** 2) + 1
    )

    const mesh = new THREE.Mesh(geometry, this.material)
    mesh.position.set(x0, 0, z0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)
    this.meshes.set(k, mesh)
  }

  // Amanatides & Woo voxel traversal
  castRay(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z)
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z)
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity
    let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : stepX < 0 ? (origin.x - x) * tDeltaX : Infinity
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : stepY < 0 ? (origin.y - y) * tDeltaY : Infinity
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : stepZ < 0 ? (origin.z - z) * tDeltaZ : Infinity
    let normal = [0, 0, 0]
    let t = 0

    while (t <= maxDist) {
      if (t > 0 && this.getBlock(x, y, z) !== AIR) {
        return { x, y, z, normal, dist: t }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; normal = [-stepX, 0, 0]
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; normal = [0, -stepY, 0]
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; normal = [0, 0, -stepZ]
      }
    }
    return null
  }
}
