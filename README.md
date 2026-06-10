# Sunsetcraft — the eternal sunset

A Minecraft-style voxel game built with three.js, set in a permanent golden-hour.
You spawn high in the air, gliding over a procedurally generated ocean coastline,
descend toward the world, land, and play — and can take off again at any time.

## Run it

```bash
npm install
npm run dev     # then open the printed localhost URL
```

`npm run build` produces a static production build in `dist/`.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look (pointer lock — click the title screen to start) |
| WASD | Move / steer while gliding |
| Space | Jump · swim up |
| Space ×2 (double-tap) | Take off and glide / stop gliding |
| Shift | Sprint (walking) · sink (swimming) |
| Left click | Break block (hold to repeat) |
| Right click | Place block (hold to repeat) |
| 1–8 / mouse wheel | Select hotbar block |

While gliding, pitch down to dive for speed, pitch up to trade speed for height.

## The look

The whole scene is tuned around one moment: a low orange sun over the sea.

- **Sky dome shader** — analytic sunset gradient (gold toward the sun azimuth,
  pink-purple away, dusk blue at zenith), an HDR sun disc, and fbm evening clouds
  that self-shade and catch fire near the sun.
- **Water shader** — animated normals, fresnel reflection of the same sky gradient,
  and a layered specular sun path stretching to the horizon (HDR, so bloom feeds on it).
- **Directional fog** — the built-in material fog is patched (`onBeforeCompile`) to fade
  geometry toward the *per-direction* sky color instead of a flat fog color, so terrain
  melts into the sunset on every bearing.
- **Light rig** — low warm directional sun (long PCF shadows) + purple hemisphere fill.
- **Post** — `postprocessing`: HDR mipmap bloom → ACES filmic tone mapping → vignette → SMAA.

## World

Infinite chunked voxel terrain (16×16×96), simplex-noise continents with a meandering
coastline: ocean to the west, beaches, rolling forested hills, ridges with snow caps.
Trees are deterministically placed per grid cell so chunk borders always agree.
Block edits survive chunk unload/reload. Meshing is face-culled with per-vertex
ambient occlusion and a procedurally painted 16×16 texture atlas (no asset files).

## Source map

| File | What it does |
| --- | --- |
| `src/main.js` | Bootstrap, lights, input, loop |
| `src/config.js` | World/sun/fog constants |
| `src/terrain.js` | Noise terrain + tree generation |
| `src/world.js` | Chunk store, mesher (AO), DDA raycast |
| `src/blocks.js` | Block registry, canvas texture atlas, hotbar icons |
| `src/player.js` | Glide/walk/swim physics, AABB collisions |
| `src/sky.js` | Sky dome shader, shared sunset GLSL, fog patch |
| `src/water.js` | Ocean shader with the sun path |
| `src/effects.js` | Bloom/tonemap/vignette/SMAA composer |
| `src/hand.js` | First-person held block |
| `src/particles.js` | Block-break particle bursts |
| `src/ui.js` | Title screen, hotbar, hints |
