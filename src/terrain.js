import { createNoise2D } from 'simplex-noise'
import { CHUNK, WORLD_H, SEA } from './config.js'
import { AIR, GRASS, DIRT, STONE, SAND, LOG, LEAVES, SNOW } from './blocks.js'

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const seed = mulberry32(20260610)
const nContinent = createNoise2D(seed)
const nCoast = createNoise2D(seed)
const nHill = createNoise2D(seed)
const nRidge = createNoise2D(seed)
const nForest = createNoise2D(seed)
const nDetail = createNoise2D(seed)

function fbm(noise, x, y, oct) {
  let amp = 1, freq = 1, sum = 0, norm = 0
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(x * freq, y * freq)
    norm += amp
    amp *= 0.5; freq *= 2.02
  }
  return sum / norm
}

const smoothstep = (a, b, t) => {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Integer position hash -> [0, 1)
export function hash2(x, z) {
  let h = (x | 0) * 374761393 + (z | 0) * 668265263
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// < 0 ocean, > 0 land. Land mass lies toward +X with a meandering coast.
export function landFactor(x, z) {
  const coast = nCoast(z * 0.0032, 4.7) * 52
  const base = fbm(nContinent, x * 0.0019, z * 0.0019, 3)
  return base * 0.58 + Math.tanh((x + 14 - coast) * 0.0062) * 0.64
}

export function heightAt(x, z) {
  const land = landFactor(x, z)
  let h = SEA + land * 23
  const lm = smoothstep(0.04, 0.5, land)
  if (lm > 0) {
    const hills = fbm(nHill, x * 0.012, z * 0.012, 4) * 0.5 + 0.5
    const ridge = 1 - Math.abs(fbm(nRidge, x * 0.0055, z * 0.0055, 3))
    h += lm * (hills * 16 + Math.pow(ridge, 2.8) * 36 * smoothstep(0.22, 0.72, land))
  }
  h += fbm(nDetail, x * 0.055, z * 0.055, 2) * 2.4
  return Math.max(3, Math.min(WORLD_H - 14, Math.floor(h)))
}

export function forestAt(x, z) {
  return fbm(nForest, x * 0.009, z * 0.009, 3)
}

const TREE_CELL = 5
// Deterministic tree per grid cell, or null
export function treeAt(cellX, cellZ) {
  const r1 = hash2(cellX * 3 + 11, cellZ * 7 + 5)
  const x = cellX * TREE_CELL + 1 + Math.floor(hash2(cellX, cellZ * 13 + 1) * (TREE_CELL - 2))
  const z = cellZ * TREE_CELL + 1 + Math.floor(hash2(cellX * 17 + 3, cellZ) * (TREE_CELL - 2))
  const f = forestAt(x, z)
  if (r1 > 0.16 + Math.max(0, f) * 0.75) return null
  const ground = heightAt(x, z)
  if (ground <= SEA + 1 || ground > 56) return null
  if (landFactor(x, z) < 0.14) return null
  const trunk = 4 + Math.floor(hash2(cellX * 31, cellZ * 37) * 3)
  return { x, z, base: ground + 1, trunk }
}

const idx = (x, y, z) => x + z * CHUNK + y * CHUNK * CHUNK

export function generateChunkData(cx, cz) {
  const data = new Uint8Array(CHUNK * CHUNK * WORLD_H)
  const x0 = cx * CHUNK, z0 = cz * CHUNK

  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      const wx = x0 + x, wz = z0 + z
      const h = heightAt(wx, wz)
      const beach = h <= SEA + 1
      const snowy = h > 63 + hash2(wx, wz) * 6
      for (let y = 0; y <= h; y++) {
        let b
        if (beach) b = y >= h - 2 ? SAND : STONE
        else if (y === h) b = snowy ? SNOW : GRASS
        else if (y >= h - 3) b = DIRT
        else b = STONE
        data[idx(x, y, z)] = b
      }
    }
  }

  // Stamp trees from all cells that could overlap this chunk (canopy radius 2)
  const minCellX = Math.floor((x0 - 3) / TREE_CELL)
  const maxCellX = Math.floor((x0 + CHUNK + 2) / TREE_CELL)
  const minCellZ = Math.floor((z0 - 3) / TREE_CELL)
  const maxCellZ = Math.floor((z0 + CHUNK + 2) / TREE_CELL)

  const put = (wx, y, wz, b, replace) => {
    const lx = wx - x0, lz = wz - z0
    if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= WORLD_H) return
    const i = idx(lx, y, lz)
    if (replace || data[i] === AIR) data[i] = b
  }

  for (let tcz = minCellZ; tcz <= maxCellZ; tcz++) {
    for (let tcx = minCellX; tcx <= maxCellX; tcx++) {
      const tree = treeAt(tcx, tcz)
      if (!tree) continue
      const top = tree.base + tree.trunk - 1
      // canopy: two wide layers, two narrow above
      for (let dy = 0; dy <= 3; dy++) {
        const y = top - 1 + dy
        const r = dy < 2 ? 2 : 1
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx === 0 && dz === 0 && dy < 2) continue
            const isCorner = Math.abs(dx) === r && Math.abs(dz) === r
            if (isCorner && (r === 2 || hash2(tree.x + dx * 3 + dy, tree.z + dz * 5) < 0.5)) continue
            put(tree.x + dx, y, tree.z + dz, LEAVES, false)
          }
        }
      }
      for (let y = tree.base; y <= top; y++) put(tree.x, y, tree.z, LOG, true)
      put(tree.x, top + 2, tree.z, LEAVES, false)
    }
  }

  return data
}
