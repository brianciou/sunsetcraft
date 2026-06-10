import * as THREE from 'three'
import { createAtlas } from './blocks.js'
import { World } from './world.js'
import { Player } from './player.js'
import { createSky, patchFogToSky } from './sky.js'
import { createWater } from './water.js'
import { createComposer } from './effects.js'
import { UI } from './ui.js'
import { Hand } from './hand.js'
import { Particles } from './particles.js'
import { Ambience } from './audio.js'
import { Birds } from './birds.js'
import { AIR } from './blocks.js'
import {
  FOG_DENSITY, SUN_DIR, SUN_LIGHT_COLOR, REACH, WATER_Y, SPAWN,
} from './config.js'

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
  stencil: false,
})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.NoToneMapping // tone mapping happens in the composer
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0xd98a5f, FOG_DENSITY)

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 2200)

// --- lights: low warm sun, dusk ambience ---
const sun = new THREE.DirectionalLight(SUN_LIGHT_COLOR, 2.65)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -120
sun.shadow.camera.right = 120
sun.shadow.camera.top = 120
sun.shadow.camera.bottom = -120
sun.shadow.camera.near = 10
sun.shadow.camera.far = 640
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 1.6
scene.add(sun)
scene.add(sun.target)

const hemi = new THREE.HemisphereLight(0xa88ec9, 0x40305a, 1.2)
scene.add(hemi)
scene.add(new THREE.AmbientLight(0x584a78, 0.48))

// --- world ---
const { canvas: atlasCanvas, texture: atlasTexture } = createAtlas()
const terrainMaterial = new THREE.MeshLambertMaterial({ map: atlasTexture, vertexColors: true })
patchFogToSky(terrainMaterial)

const world = new World(scene, terrainMaterial)
const sky = createSky()
scene.add(sky)
const water = createWater()
scene.add(water)

// --- player + UI ---
const ui = new UI(atlasCanvas)
const player = new Player(camera, world)
const hand = new Hand(camera, scene, atlasTexture)
const particles = new Particles(scene, atlasCanvas)
const ambience = new Ambience()
const birds = new Birds(scene)
player.onModeChange = (mode) => {
  ui.showMode(mode === 'gliding' ? 'Gliding' : 'Walking')
  if (mode === 'walking') ui.showHint('Double-tap Space to take off again')
}

// targeted-block outline
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x1a1026, transparent: true, opacity: 0.65 })
)
outline.visible = false
scene.add(outline)

// --- input ---
let locked = false
document.getElementById('overlay').addEventListener('click', () => {
  renderer.domElement.requestPointerLock()
})
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement
  ui.setLocked(locked)
  if (locked) ambience.start()
  ambience.setPaused(!locked)
  if (locked && player.frozen) {
    player.frozen = false
    ui.showMode('Gliding')
    ui.showHint('Pitch down to dive · pitch up to soar')
  }
})
document.addEventListener('mousemove', (e) => {
  if (locked) player.handleMouse(e.movementX, e.movementY)
})
document.addEventListener('keydown', (e) => {
  if (!locked || e.repeat) return
  player.keyDown(e.code)
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10)
    if (n >= 1 && n <= 8) hand.setBlock(ui.select(n - 1))
  }
})
document.addEventListener('keyup', (e) => player.keyUp(e.code))
document.addEventListener('wheel', (e) => {
  if (locked) hand.setBlock(ui.select(ui.selected + Math.sign(e.deltaY)))
})
document.addEventListener('contextmenu', (e) => e.preventDefault())

// break / place with hold-to-repeat
const mouse = { left: false, right: false, leftT: 0, rightT: 0 }
document.addEventListener('mousedown', (e) => {
  if (!locked) return
  if (e.button === 0) { mouse.left = true; mouse.leftT = 0; breakBlock() }
  if (e.button === 2) { mouse.right = true; mouse.rightT = 0; placeBlock() }
})
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.left = false
  if (e.button === 2) mouse.right = false
})

function rayHit() {
  return world.castRay(camera.position, player.lookDir(), REACH)
}

function breakBlock() {
  hand.swing()
  const hit = rayHit()
  if (!hit) return
  const id = world.getBlock(hit.x, hit.y, hit.z)
  world.setBlock(hit.x, hit.y, hit.z, AIR)
  particles.burst(hit.x, hit.y, hit.z, id)
}

function placeBlock() {
  hand.swing()
  const hit = rayHit()
  if (!hit) return
  const px = hit.x + hit.normal[0], py = hit.y + hit.normal[1], pz = hit.z + hit.normal[2]
  if (world.getBlock(px, py, pz) !== AIR) return
  if (player.intersectsBlock(px, py, pz)) return
  world.setBlock(px, py, pz, ui.selectedBlock())
}

// --- pre-warm chunks around spawn so the first frame is a vista, not a void ---
{
  const pcx = Math.floor(SPAWN.x / 16), pcz = Math.floor(SPAWN.z / 16)
  for (let r = 0; r <= 4; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        world.buildChunkMesh(pcx + dx, pcz + dz)
      }
    }
  }
}

// --- post ---
const composer = createComposer(renderer, scene, camera)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  composer.setSize(window.innerWidth, window.innerHeight)
})

window.__dbg = { renderer, composer, scene, camera, player, world, sky, water, hand, particles, THREE }

// --- main loop ---
const clock = new THREE.Clock()
let elapsed = 0

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.05)
  elapsed += dt

  player.update(dt)
  world.update(player.pos, player.gliding ? 4 : 2)

  // hold-to-repeat mining/placing
  if (mouse.left) { mouse.leftT += dt; if (mouse.leftT > 0.22) { mouse.leftT = 0; breakBlock() } }
  if (mouse.right) { mouse.rightT += dt; if (mouse.rightT > 0.25) { mouse.rightT = 0; placeBlock() } }

  // block outline
  if (locked && !player.gliding) {
    const hit = rayHit()
    if (hit) {
      outline.visible = true
      outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
    } else outline.visible = false
  } else outline.visible = false

  // sun + shadow frustum follow the player
  sun.target.position.copy(player.pos)
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 320)
  sky.position.copy(camera.position)
  water.position.x = camera.position.x
  water.position.z = camera.position.z

  sky.material.uniforms.uTime.value = elapsed
  water.material.uniforms.uTime.value = elapsed
  hand.update(dt)
  particles.update(dt)
  birds.update(elapsed, player.pos)
  ambience.update(elapsed, {
    gliding: player.gliding,
    glideSpeed: player.glideSpeed,
    y: player.pos.y,
    underwater: camera.position.y < WATER_Y,
  })

  ui.setUnderwater(camera.position.y < WATER_Y)

  composer.render(dt)
}
animate()
