import * as THREE from 'three'
import { SUN_DIR } from './config.js'

// Shared GLSL: noise + the sunset gradient, reused by sky dome, water and fog patch
export const skyGLSL = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm2(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

// NaN-safe horizontal normalize (looking straight up/down has no azimuth)
vec2 safeXZ(vec2 v) {
  float l = length(v);
  return l > 1e-5 ? v / l : vec2(0.0, 1.0);
}

// Eternal-sunset gradient for a view direction.
// Gold/orange toward the sun azimuth, pink-purple away, deep dusk blue at zenith.
vec3 skyGradient(vec3 dir, vec3 sunDir) {
  vec2 sxz = safeXZ(sunDir.xz);
  vec2 dxz = safeXZ(dir.xz);
  // clamp: pow() with a (rounding-error) negative base is undefined → NaN on some GPUs
  float az = clamp(dot(dxz, sxz) * 0.5 + 0.5, 0.0, 1.0);
  float azs = pow(az, 2.1);
  float y = clamp(dir.y, 0.0, 1.0);

  vec3 horizonSun  = vec3(1.55, 0.50, 0.13);
  vec3 horizonAway = vec3(0.52, 0.30, 0.56);
  vec3 midSun      = vec3(0.95, 0.42, 0.38);
  vec3 midAway     = vec3(0.38, 0.26, 0.52);
  vec3 zenith      = vec3(0.15, 0.145, 0.33);

  vec3 horizon = mix(horizonAway, horizonSun, azs);
  vec3 midband = mix(midAway, midSun, azs);

  float th = pow(1.0 - y, 5.0);
  float tm = pow(1.0 - y, 2.0);
  vec3 col = mix(zenith, midband, tm);
  col = mix(col, horizon, th);

  float sd = max(dot(dir, sunDir), 0.0);
  col += vec3(1.25, 0.40, 0.10) * pow(sd, 16.0) * 0.22;  // warm aureole
  col += vec3(0.85, 0.45, 0.55) * pow(sd, 3.0) * 0.07;   // wide rosy wash
  return col;
}
`

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
varying vec3 vDir;
uniform float uTime;
uniform vec3 uSunDir;
${''}
__SKY_GLSL__

void main() {
  vec3 dir = normalize(vDir);
  vec3 col = skyGradient(dir, uSunDir);
  float sd = dot(dir, uSunDir);

  // --- evening clouds ---
  float cov = 0.0;
  vec3 cloudCol = vec3(0.0);
  if (dir.y > 0.012) {
    vec2 cp = dir.xz / (dir.y + 0.16) * 0.85;
    cp += vec2(uTime * 0.0045, uTime * 0.0016);
    vec2 w1 = vec2(0.85, 1.65);
    float base = fbm2(cp * w1);
    float wisp = fbm2(cp * vec2(0.32, 3.0) + 7.7);
    float d = base * 0.72 + wisp * 0.46;
    cov = smoothstep(0.60, 0.96, d);
    cov *= smoothstep(0.012, 0.07, dir.y);   // settle into the horizon haze
    cov *= 0.92;

    // cheap self-shadowing: density gradient toward the sun
    vec2 sunStep = safeXZ(uSunDir.xz) * 0.15;
    float d2 = fbm2((cp + sunStep) * w1) * 0.72 + fbm2((cp + sunStep) * vec2(0.32, 3.0) + 7.7) * 0.46;
    float lit = clamp((d - d2) * 3.2 + 0.55, 0.0, 1.0);

    vec2 sxz = safeXZ(uSunDir.xz);
    vec2 dxz = safeXZ(dir.xz);
    float az = pow(clamp(dot(dxz, sxz) * 0.5 + 0.5, 0.0, 1.0), 2.0);
    vec3 litCol  = mix(vec3(0.98, 0.50, 0.62), vec3(1.65, 0.95, 0.48), az); // pink -> gold
    vec3 shadCol = mix(vec3(0.29, 0.225, 0.45), vec3(0.62, 0.30, 0.36), az);
    cloudCol = mix(shadCol, litCol, lit);
    cloudCol += vec3(1.45, 0.62, 0.22) * pow(max(sd, 0.0), 14.0) * 0.8; // fire rim near the sun
  }

  // --- sun glow + disc, partially veiled by clouds ---
  col += vec3(1.55, 0.55, 0.14) * pow(max(sd, 0.0), 64.0) * 0.30;
  col = mix(col, cloudCol, cov);
  float disc = smoothstep(0.99825, 0.99900, sd);
  vec3 sunCol = vec3(3.3, 0.82, 0.10); // HDR but stays orange through ACES
  col = mix(col, sunCol, disc * (1.0 - cov * 0.85));

  // dithering against banding
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 13.7) - 0.5) * 0.012;
  // last line of defense: a single NaN pixel poisons the bloom mip chain into black blocks
  if (!(col.r == col.r) || !(col.g == col.g) || !(col.b == col.b)) col = vec3(0.5, 0.33, 0.4);
  gl_FragColor = vec4(col, 1.0);
}
`.replace('__SKY_GLSL__', skyGLSL)

export function createSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 32), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  return mesh
}

// Patches a built-in material so its fog fades toward the directional sky color
// instead of a flat fog color — terrain melts into the sunset.
export function patchFogToSky(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: SUN_DIR.clone() }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPos;\nuniform vec3 uSunDir;\n' + skyGLSL
      )
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  fogFactor = clamp(fogFactor, 0.0, 1.0);
  vec3 fdir = normalize(vWorldPos - cameraPosition);
  fdir.y = max(fdir.y, -0.015);
  vec3 fogCol = skyGradient(normalize(fdir), uSunDir);
  float sunGlare = pow(max(dot(normalize(fdir), uSunDir), 0.0), 8.0);
  fogCol += vec3(1.0, 0.42, 0.15) * sunGlare * 0.25;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, fogFactor);
#endif
        `
      )
  }
  material.needsUpdate = true
}
