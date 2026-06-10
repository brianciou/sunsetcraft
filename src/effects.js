import * as THREE from 'three'
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, SMAAEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode,
} from 'postprocessing'

export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
  })
  composer.addPass(new RenderPass(scene, camera))

  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: 1.0,
    luminanceSmoothing: 0.35,
    intensity: 0.5,
    radius: 0.55,
    levels: 7,
  })
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.52 })
  composer.addPass(new EffectPass(camera, bloom, tone, vignette))
  composer.addPass(new EffectPass(camera, new SMAAEffect()))

  return composer
}
