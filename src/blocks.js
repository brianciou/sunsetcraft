import * as THREE from 'three'

// Block ids
export const AIR = 0
export const GRASS = 1
export const DIRT = 2
export const STONE = 3
export const SAND = 4
export const LOG = 5
export const LEAVES = 6
export const PLANKS = 7
export const SNOW = 8

// tiles indexed into a 4x4 atlas; face order matches mesher: [-x, +x, -y, +y, -z, +z]
export const BLOCKS = {
  [GRASS]:  { name: 'Grass',  tiles: [1, 1, 2, 0, 1, 1] },
  [DIRT]:   { name: 'Dirt',   tiles: [2, 2, 2, 2, 2, 2] },
  [STONE]:  { name: 'Stone',  tiles: [3, 3, 3, 3, 3, 3] },
  [SAND]:   { name: 'Sand',   tiles: [4, 4, 4, 4, 4, 4] },
  [LOG]:    { name: 'Log',    tiles: [5, 5, 6, 6, 5, 5] },
  [LEAVES]: { name: 'Leaves', tiles: [7, 7, 7, 7, 7, 7] },
  [PLANKS]: { name: 'Planks', tiles: [8, 8, 8, 8, 8, 8] },
  [SNOW]:   { name: 'Snow',   tiles: [9, 9, 9, 9, 9, 9] },
}

export const HOTBAR = [GRASS, DIRT, STONE, SAND, LOG, LEAVES, PLANKS, SNOW]

const TILE = 16
const COLS = 4
export const ATLAS_TILES = COLS // exported for the mesher's UV math

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Paint one 16x16 tile; fn(x, y, rnd) -> [r, g, b, a?]
function paint(ctx, tileIndex, fn) {
  const rnd = mulberry32(7919 + tileIndex * 131)
  const img = ctx.createImageData(TILE, TILE)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const [r, g, b, a = 255] = fn(x, y, rnd)
      const i = (y * TILE + x) * 4
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a
    }
  }
  const tx = (tileIndex % COLS) * TILE
  const ty = Math.floor(tileIndex / COLS) * TILE
  ctx.putImageData(img, tx, ty)
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)))
const speckle = (base, rnd, amt) => {
  const d = (rnd() - 0.5) * 2 * amt
  return [clamp255(base[0] + d), clamp255(base[1] + d), clamp255(base[2] + d)]
}

export function createAtlas() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TILE * COLS
  const ctx = canvas.getContext('2d')

  // 0 grass top — slightly dry, warm green
  paint(ctx, 0, (x, y, rnd) => {
    const c = speckle([128, 172, 82], rnd, 16)
    if (rnd() < 0.08) return [clamp255(c[0] + 24), clamp255(c[1] + 28), clamp255(c[2] + 12)]
    return c
  })
  // 1 grass side — dirt with ragged grass lip
  paint(ctx, 1, (x, y, rnd) => {
    const lip = 3 + (Math.floor(rnd() * 100 + x * 7) % 2)
    if (y < lip) return speckle([120, 164, 76], rnd, 14)
    return speckle([136, 99, 66], rnd, 14)
  })
  // 2 dirt
  paint(ctx, 2, (x, y, rnd) => {
    const c = speckle([136, 99, 66], rnd, 16)
    if (rnd() < 0.07) return [98, 70, 48]
    return c
  })
  // 3 stone
  paint(ctx, 3, (x, y, rnd) => {
    const band = Math.sin(x * 0.9 + y * 1.7) * 6
    const c = speckle([132, 132, 138], rnd, 9)
    return [clamp255(c[0] + band), clamp255(c[1] + band), clamp255(c[2] + band)]
  })
  // 4 sand
  paint(ctx, 4, (x, y, rnd) => {
    const c = speckle([223, 205, 152], rnd, 11)
    if (rnd() < 0.05) return [200, 178, 124]
    return c
  })
  // 5 log side — vertical bark
  paint(ctx, 5, (x, y, rnd) => {
    const stripe = (x % 4 === 0 || (x + 1) % 7 === 0) ? -22 : 0
    const c = speckle([104, 78, 48], rnd, 10)
    return [clamp255(c[0] + stripe), clamp255(c[1] + stripe * 0.9), clamp255(c[2] + stripe * 0.8)]
  })
  // 6 log top — rings
  paint(ctx, 6, (x, y, rnd) => {
    const d = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2)
    const ring = (Math.floor(d) % 2 === 0) ? 14 : -10
    const c = speckle([150, 116, 72], rnd, 7)
    return [clamp255(c[0] + ring), clamp255(c[1] + ring), clamp255(c[2] + ring * 0.7)]
  })
  // 7 leaves — deep green with dark pockets
  paint(ctx, 7, (x, y, rnd) => {
    if (rnd() < 0.14) return [42, 74, 34]
    return speckle([76, 122, 54], rnd, 20)
  })
  // 8 planks — boards
  paint(ctx, 8, (x, y, rnd) => {
    if (y % 4 === 3) return [116, 86, 50]
    if ((x + Math.floor(y / 4) * 5) % 8 === 0) return [128, 96, 56]
    return speckle([172, 134, 82], rnd, 9)
  })
  // 9 snow
  paint(ctx, 9, (x, y, rnd) => speckle([238, 238, 246], rnd, 7))

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  return { canvas, texture }
}

// Draw a small isometric cube icon for the hotbar
export function makeIcon(blockId, atlasCanvas) {
  const def = BLOCKS[blockId]
  const icon = document.createElement('canvas')
  icon.width = icon.height = 64
  const ctx = icon.getContext('2d')
  ctx.imageSmoothingEnabled = false

  const topTile = def.tiles[3]
  const sideTile = def.tiles[0]
  const src = (t) => [(t % COLS) * TILE, Math.floor(t / COLS) * TILE]

  const w = 19, hh = 19, cx = 32, cy0 = 8
  const drawFace = (matrix, tile, shade) => {
    const [sx, sy] = src(tile)
    ctx.setTransform(...matrix)
    ctx.drawImage(atlasCanvas, sx, sy, TILE, TILE, 0, 0, 1, 1)
    if (shade > 0) {
      ctx.fillStyle = `rgba(18, 10, 36, ${shade})`
      ctx.fillRect(0, 0, 1, 1)
    }
  }
  // top diamond, then left and right faces hanging from its lower edges
  drawFace([w, w * 0.5, -w, w * 0.5, cx, cy0], topTile, 0)
  drawFace([w, w * 0.5, 0, hh, cx - w, cy0 + w * 0.5], sideTile, 0.42)
  drawFace([w, -w * 0.5, 0, hh, cx, cy0 + w], sideTile, 0.22)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return icon
}
