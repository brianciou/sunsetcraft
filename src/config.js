import * as THREE from 'three'

export const CHUNK = 16          // chunk footprint in blocks
export const WORLD_H = 96        // world height in blocks
export const SEA = 22            // sea level (block index)
export const WATER_Y = SEA + 0.38

export const VIEW_DIST = 8       // chunk load radius (chebyshev)
export const UNLOAD_DIST = 10
export const FOG_DENSITY = 0.0028

// Direction TO the sun — low over the ocean (ocean lies toward -X)
export const SUN_DIR = new THREE.Vector3(-1.0, 0.15, -0.28).normalize()
export const SUN_LIGHT_COLOR = 0xffa765
export const SPAWN = new THREE.Vector3(64.5, 116, 8.5)
export const SPAWN_YAW = Math.PI / 2 - 0.25   // facing -X (toward the sun & sea)
export const SPAWN_PITCH = -0.16

export const GRAVITY = 24
export const REACH = 7
