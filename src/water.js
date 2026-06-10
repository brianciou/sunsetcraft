import * as THREE from 'three'
import { SUN_DIR, WATER_Y, FOG_DENSITY } from './config.js'
import { skyGLSL } from './sky.js'

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const fragmentShader = /* glsl */ `
varying vec3 vWorldPos;
uniform float uTime;
uniform vec3 uSunDir;
uniform float uFogDensity;

__SKY_GLSL__

// layered wave height field
float waveH(vec2 p, float t) {
  float h = 0.0;
  h += vnoise(p * 0.16 + vec2(t * 0.05, t * 0.031)) * 0.95;
  h += vnoise(p * 0.42 + vec2(-t * 0.075, t * 0.052)) * 0.42;
  h += vnoise(p * 1.15 + vec2(t * 0.11, -t * 0.085)) * 0.18;
  h += sin(p.x * 0.21 + p.y * 0.13 + t * 0.55) * 0.30;
  return h;
}

void main() {
  vec2 p = vWorldPos.xz;
  float t = uTime;
  float dist = length(vWorldPos - cameraPosition);

  // normals from finite differences; fine detail fades with distance
  float fine = 1.0 - smoothstep(40.0, 420.0, dist);
  float e = 0.55;
  float hC = waveH(p, t);
  float hX = waveH(p + vec2(e, 0.0), t);
  float hZ = waveH(p + vec2(0.0, e), t);
  float amp = mix(0.32, 1.0, fine);
  vec3 n = normalize(vec3((hC - hX) * amp, e * 1.05, (hC - hZ) * amp));

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 R = reflect(-V, n);
  R.y = max(R.y, 0.02);
  R = normalize(R);

  // reflected sunset sky
  vec3 skyRefl = skyGradient(R, uSunDir);

  // clamp the base: dot() can exceed 1 by rounding error and pow(negative, x) is NaN on some GPUs
  float fresnel = 0.06 + 0.94 * pow(clamp(1.0 - dot(V, n), 0.0, 1.0), 5.0);
  fresnel = clamp(fresnel, 0.0, 1.0);

  vec3 deep = vec3(0.028, 0.06, 0.14);   // dusk-blue body of water
  vec3 col = mix(deep + skyRefl * 0.06, skyRefl * 0.88, fresnel);

  // --- the sun path: glints stretching to the horizon ---
  float rd = max(dot(R, uSunDir), 0.0);
  float sparkle = 0.75 + 0.5 * vnoise(p * 1.7 + vec2(t * 0.35, -t * 0.22));
  vec3 sunCol = vec3(1.0, 0.40, 0.10);
  vec3 glint = sunCol * (
      pow(rd, 1100.0) * 6.0
    + pow(rd, 160.0) * 3.4 * sparkle
    + pow(rd, 55.0) * 0.5
    + pow(rd, 26.0) * 0.16
  );

  // directional fog — same gradient the terrain fades into
  float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  fogFactor = clamp(fogFactor, 0.0, 1.0);
  vec3 fdir = normalize(vWorldPos - cameraPosition);
  fdir.y = max(fdir.y, -0.015);
  vec3 fogCol = skyGradient(normalize(fdir), uSunDir);
  float sunGlare = pow(max(dot(normalize(fdir), uSunDir), 0.0), 8.0);
  fogCol += vec3(1.0, 0.42, 0.15) * sunGlare * 0.25;
  col = mix(col, fogCol, fogFactor);

  // the sun path punches through the mist — this is the money shot
  col += glint * (0.35 + 0.65 * fresnel) * (1.0 - fogFactor * 0.35);

  float alpha = mix(0.93, 1.0, fogFactor);
  // NaN scrub — keep the bloom mip chain clean
  if (!(col.r == col.r) || !(col.g == col.g) || !(col.b == col.b)) col = fogCol;
  gl_FragColor = vec4(col, alpha);
}
`.replace('__SKY_GLSL__', skyGLSL)

export function createWater() {
  const geometry = new THREE.PlaneGeometry(9000, 9000)
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    fog: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = WATER_Y
  mesh.renderOrder = 2
  return mesh
}
