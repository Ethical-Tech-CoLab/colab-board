import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  fitBoardCamera,
  boardPointToTextureUV,
  texturePlaneCoords,
  getItemBounds,
} from './board'
import type { BrandTheme } from './branding'
import { drawScene, type ImageCache } from './render'
import type {
  BoardDocument,
  BoardItem,
  Camera,
  WaterDropLocation,
} from './types'
import {
  probeWebGL,
  randomDropDelay,
  randomWaveAmplitude,
  INTENSITY_AMPLITUDE,
} from './waterUtils'

const TEXTURE_W = 1024
const TEXTURE_H = 1024
const MAX_WAVES = 12
const PLANE_SEGMENTS = 512
const RIPPLE_LIFETIME_SECONDS = 9

const WATER_VERTEX_SHADER = `
uniform float uTime;
uniform vec4 uWaves[12];
uniform int uWaveCount;
uniform float uAmplitude;
varying vec2 vUv;
varying vec3 vPos;
varying float vHeight;

float waveH(vec2 p, vec4 w, float t) {
  float age = t - w.z;
  if (age < 0.0 || age > 9.0) return 0.0;
  float dist = length(p - w.xy);
  float env = exp(-(age * 0.35 + dist * 1.1)) * w.w;
  return sin((dist - age * 0.55) * 34.0) * env;
}

void main() {
  vUv = uv;
  vec2 planePos = vec2(position.x, -position.z);
  float h = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= uWaveCount) break;
    h += waveH(planePos, uWaves[i], uTime);
  }
  h += sin(planePos.x * 3.1 + uTime * 0.65) * cos(planePos.y * 2.7 + uTime * 0.48) * 0.015;
  vHeight = h;
  vec3 displaced = position + vec3(0.0, h * uAmplitude, 0.0);
  vPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`

const WATER_FRAGMENT_SHADER = `
uniform sampler2D uBoardTex;
uniform vec3 uWaterColor;
uniform vec3 uLightPos;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vPos;
varying float vHeight;

void main() {
  vec3 fdx = dFdx(vPos);
  vec3 fdy = dFdy(vPos);
  vec3 N = normalize(cross(fdx, fdy));

  vec2 refract = N.xz * 0.038;
  vec2 boardUv = clamp(vUv + refract, 0.0, 1.0);
  vec4 board = texture2D(uBoardTex, boardUv);

  vec3 L = normalize(uLightPos - vPos);
  vec3 V = vec3(0.0, 1.0, 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 80.0) * 0.85;
  float diff = max(dot(N, L), 0.0) * 0.12;
  float fresnel = pow(1.0 - abs(dot(N, V)), 2.5);

  vec3 col = mix(board.rgb, uWaterColor, 0.15 + fresnel * 0.35);
  col += uWaterColor * diff;
  col += vec3(spec);

  gl_FragColor = vec4(col, uOpacity);
}
`

export interface WaterScreensaverPrefs {
  waterDropFrequency: 'slow' | 'medium' | 'fast'
  waterDropLocation: WaterDropLocation
  waterRandomLocationOverride: boolean
  waterDisturbancePreset: 'ripple' | 'drop' | 'splash'
  waterDisturbanceCount: 1 | 2 | 3
  waterIntensity: 'subtle' | 'medium' | 'strong'
}

interface WaterScreensaverProps {
  document: BoardDocument
  theme: BrandTheme
  prefs: WaterScreensaverPrefs
}

interface WaveState {
  x: number
  y: number
  startTime: number
  amplitude: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function getItemCentroid(item: BoardItem) {
  if (item.type === 'stroke' && item.points.length > 0) {
    const total = item.points.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    )
    return {
      x: total.x / item.points.length,
      y: total.y / item.points.length,
    }
  }

  const bounds = getItemBounds(item)
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
}

function getWaterColor(theme: BrandTheme) {
  return new THREE.Color(theme.browserThemeColor)
    .lerp(new THREE.Color(theme.canvas.background), 0.28)
    .lerp(new THREE.Color('#5ebfda'), 0.4)
}

/**
 * Resolve a drop position in plane coords [-1, 1] for the given location strategy.
 * Returns null when board-objects strategy is selected but there are no items.
 */
function resolveDropPosition(
  location: WaterDropLocation,
  randomOverride: boolean,
  items: BoardItem[],
  fittedCamera: Camera,
): { x: number; y: number } | null {
  // Random override: with 20% probability substitute a fully random position
  if (randomOverride && location === 'board-objects' && Math.random() < 0.20) {
    return { x: (Math.random() * 2 - 1) * 0.9, y: (Math.random() * 2 - 1) * 0.9 }
  }

  switch (location) {
    case 'board-objects': {
      if (items.length === 0) return null
      const item = items[Math.floor(Math.random() * items.length)]
      const centroid = getItemCentroid(item)
      const { u, v } = boardPointToTextureUV(
        centroid.x,
        centroid.y,
        fittedCamera,
        TEXTURE_W,
        TEXTURE_H,
      )
      return texturePlaneCoords(u, v)
    }
    case 'center': {
      // Small Gaussian-like jitter around centre
      const jitter = 0.18
      return {
        x: (Math.random() - 0.5) * jitter * 2,
        y: (Math.random() - 0.5) * jitter * 2,
      }
    }
    case 'edges': {
      // Pick a random edge and a random position along it
      const edge = Math.floor(Math.random() * 4)
      const t = Math.random() * 2 - 1
      const margin = 0.85
      if (edge === 0) return { x: t, y: -margin }
      if (edge === 1) return { x: t, y: margin }
      if (edge === 2) return { x: -margin, y: t }
      return { x: margin, y: t }
    }
    case 'random':
    default:
      return { x: (Math.random() * 2 - 1) * 0.9, y: (Math.random() * 2 - 1) * 0.9 }
  }
}

interface FallbackDeps {
  documentRef: { current: BoardDocument }
  themeRef: { current: BrandTheme }
  refreshBoardTextureRef: { current: (() => void) | null }
  imageCache: ImageCache
}

/**
 * Lightweight 2D fallback activated when WebGL construction fails.
 * Renders the board via drawScene onto a plain canvas and overlays a CSS
 * shimmer animation to preserve the water feel.  Wires the same
 * refreshBoardTextureRef hook so prop-change refreshes still work.
 * Returns a cleanup function compatible with useEffect.
 */
function mountFallback2D(
  container: HTMLElement,
  boardCanvas: HTMLCanvasElement,
  boardContext: CanvasRenderingContext2D,
  deps: FallbackDeps,
): () => void {
  const { documentRef, themeRef, refreshBoardTextureRef, imageCache } = deps
  let destroyed = false
  let currentFittedCamera: Camera = { x: 0, y: 0, scale: 1 }

  boardCanvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
  container.appendChild(boardCanvas)

  const shimmerEl = globalThis.document.createElement('div')
  shimmerEl.className = 'water-fallback-shimmer'
  shimmerEl.setAttribute('aria-hidden', 'true')
  container.appendChild(shimmerEl)

  const refresh = () => {
    if (destroyed) return
    const doc = documentRef.current
    currentFittedCamera = fitBoardCamera(doc.items, TEXTURE_W, TEXTURE_H)
    drawScene(boardContext, TEXTURE_W, TEXTURE_H, doc.items, currentFittedCamera, imageCache, {
      notes: true,
      watermark: doc.watermark,
      theme: themeRef.current.canvas,
      onImageLoad: () => {
        if (!destroyed) refresh()
      },
    })
  }

  refreshBoardTextureRef.current = refresh
  refresh()

  return () => {
    destroyed = true
    refreshBoardTextureRef.current = null
    boardCanvas.remove()
    shimmerEl.remove()
    imageCache.clear()
  }
}

export default function WaterScreensaver(props: WaterScreensaverProps) {
  const { document: boardDocument, theme, prefs } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef(boardDocument)
  const themeRef = useRef(theme)
  const prefsRef = useRef(prefs)
  const refreshBoardTextureRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    documentRef.current = boardDocument
    themeRef.current = theme
    prefsRef.current = prefs
    refreshBoardTextureRef.current?.()
  }, [boardDocument, theme, prefs])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const boardCanvas = globalThis.document.createElement('canvas')
    boardCanvas.width = TEXTURE_W
    boardCanvas.height = TEXTURE_H
    const boardContext = boardCanvas.getContext('2d')
    if (!boardContext) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const imageCache: ImageCache = new Map()
    const fallbackDeps: FallbackDeps = {
      documentRef,
      themeRef,
      refreshBoardTextureRef,
      imageCache,
    }

    // Probe before allocating any Three.js objects.  Also catch synchronous
    // construction errors (e.g. context-creation failure inside Three.js).
    if (!probeWebGL()) {
      console.warn('[WaterScreensaver] WebGL unavailable; using 2D canvas fallback')
      return mountFallback2D(container, boardCanvas, boardContext, fallbackDeps)
    }

    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    } catch (error) {
      console.warn(
        '[WaterScreensaver] WebGLRenderer construction failed; using 2D canvas fallback:',
        error,
      )
    }
    if (!renderer) {
      return mountFallback2D(container, boardCanvas, boardContext, fallbackDeps)
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, prefersReducedMotion ? 1 : 2),
    )
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.inset = '0'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 12)
    camera.position.set(0, 1.55, 1.32)
    camera.lookAt(0, 0, 0)

    const ambientLight = new THREE.AmbientLight('#9fdaf0', 0.35)
    const sunLight = new THREE.DirectionalLight('#ffffff', 1.1)
    sunLight.position.set(0.7, 1.4, 1.15)
    const shimmerLight = new THREE.PointLight('#7fd4ff', 0.85, 6)
    shimmerLight.position.set(-0.45, 0.78, 0.2)
    scene.add(ambientLight, sunLight, shimmerLight)

    const boardTexture = new THREE.CanvasTexture(boardCanvas)
    boardTexture.colorSpace = THREE.SRGBColorSpace
    boardTexture.minFilter = THREE.LinearFilter
    boardTexture.magFilter = THREE.LinearFilter
    boardTexture.wrapS = THREE.ClampToEdgeWrapping
    boardTexture.wrapT = THREE.ClampToEdgeWrapping
    boardTexture.generateMipmaps = false

    const uniformWaves = Array.from({ length: MAX_WAVES }, () => new THREE.Vector4())
    const initialAmplitude = prefersReducedMotion
      ? 0.01
      : INTENSITY_AMPLITUDE[prefsRef.current.waterIntensity]
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uWaves: { value: uniformWaves },
        uWaveCount: { value: 0 },
        uAmplitude: { value: initialAmplitude },
        uBoardTex: { value: boardTexture },
        uWaterColor: { value: getWaterColor(themeRef.current) },
        uLightPos: { value: new THREE.Vector3() },
        uOpacity: { value: 0.98 },
      },
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
    })

    const geometry = new THREE.PlaneGeometry(2, 2, PLANE_SEGMENTS, PLANE_SEGMENTS)
    geometry.rotateX(-Math.PI / 2)
    const waterMesh = new THREE.Mesh(geometry, material)
    scene.add(waterMesh)

    const startedAt = performance.now()
    const elapsedSeconds = () => (performance.now() - startedAt) / 1000
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const lightPosition = new THREE.Vector3()
    const waves: WaveState[] = []
    // Tracks the camera used for the most recent texture render so that ripple
    // positions can be mapped through the same transform.
    let currentFittedCamera: Camera = { x: 0, y: 0, scale: 1 }
    let destroyed = false
    let frameId: number | undefined
    let rippleTimeoutId: number | undefined

    const syncTheme = () => {
      ambientLight.color.set(themeRef.current.canvas.selection)
      shimmerLight.color.set(themeRef.current.browserThemeColor)
      material.uniforms.uWaterColor.value.copy(getWaterColor(themeRef.current))
    }

    const syncIntensity = () => {
      if (prefersReducedMotion) return
      material.uniforms.uAmplitude.value =
        INTENSITY_AMPLITUDE[prefsRef.current.waterIntensity]
    }

    const refreshBoardTexture = () => {
      if (destroyed) return
      syncTheme()
      syncIntensity()
      const currentDocument = documentRef.current
      // Recompute the fit-to-items camera so all board objects appear in the
      // texture, then store it for ripple coordinate mapping.
      currentFittedCamera = fitBoardCamera(currentDocument.items, TEXTURE_W, TEXTURE_H)
      drawScene(
        boardContext,
        TEXTURE_W,
        TEXTURE_H,
        currentDocument.items,
        currentFittedCamera,
        imageCache,
        {
          notes: true,
          watermark: currentDocument.watermark,
          theme: themeRef.current.canvas,
          onImageLoad: () => {
            if (!destroyed) refreshBoardTexture()
          },
        },
      )
      boardTexture.needsUpdate = true
    }

    refreshBoardTextureRef.current = refreshBoardTexture

    const addRipple = (x: number, y: number, amplitude: number) => {
      if (prefersReducedMotion) return
      waves.push({
        x: clamp(x, -1, 1),
        y: clamp(y, -1, 1),
        startTime: elapsedSeconds(),
        amplitude,
      })
      if (waves.length > MAX_WAVES) waves.splice(0, waves.length - MAX_WAVES)
    }

    const triggerDrop = () => {
      const currentPrefs = prefsRef.current
      const items = documentRef.current.items

      const origin = resolveDropPosition(
        currentPrefs.waterDropLocation,
        currentPrefs.waterRandomLocationOverride,
        items,
        currentFittedCamera,
      )
      if (!origin) return

      const count = currentPrefs.waterDisturbanceCount
      const isSplash = currentPrefs.waterDisturbancePreset === 'splash'

      for (let index = 0; index < count; index++) {
        let x = origin.x
        let y = origin.y
        if (count > 1 || isSplash) {
          // Spread sub-drops with slight offset so they are distinguishable
          const spread = isSplash ? 0.14 : 0.06
          x = clamp(origin.x + (Math.random() - 0.5) * spread * 2, -1, 1)
          y = clamp(origin.y + (Math.random() - 0.5) * spread * 2, -1, 1)
        }
        addRipple(x, y, randomWaveAmplitude(currentPrefs.waterDisturbancePreset))
      }
    }

    const scheduleRipple = () => {
      if (prefersReducedMotion) return
      rippleTimeoutId = window.setTimeout(() => {
        triggerDrop()
        scheduleRipple()
      }, randomDropDelay(prefsRef.current.waterDropFrequency))
    }

    const updateLayout = () => {
      const { width, height } = container.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      const aspect = width / height
      if (aspect >= 1) {
        waterMesh.scale.set(aspect * 1.28, 1, 1.28)
      } else {
        waterMesh.scale.set(1.28, 1, (1 / aspect) * 1.28)
      }
    }

    const resizeObserver = new ResizeObserver(updateLayout)
    resizeObserver.observe(container)
    updateLayout()
    refreshBoardTexture()
    scheduleRipple()

    const handlePointerDown = (event: PointerEvent) => {
      if (prefersReducedMotion) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(waterMesh, false)[0]
      if (!hit) return
      const localPoint = waterMesh.worldToLocal(hit.point.clone())
      addRipple(localPoint.x, -localPoint.z, 0.95)
    }

    container.addEventListener('pointerdown', handlePointerDown)

    const animate = () => {
      if (destroyed) return
      const time = elapsedSeconds()
      shimmerLight.position.set(
        Math.sin(time * 0.63) * 0.86,
        0.78 + Math.sin(time * 0.41) * 0.08,
        0.15 + Math.cos(time * 0.47) * 0.54,
      )
      lightPosition
        .copy(sunLight.position)
        .multiplyScalar(0.82)
        .addScaledVector(shimmerLight.position, 0.45)
      material.uniforms.uLightPos.value.copy(lightPosition)
      material.uniforms.uTime.value = time

      for (let index = waves.length - 1; index >= 0; index -= 1) {
        if (time - waves[index].startTime > RIPPLE_LIFETIME_SECONDS) {
          waves.splice(index, 1)
        }
      }

      material.uniforms.uWaveCount.value = prefersReducedMotion ? 0 : waves.length
      for (let index = 0; index < MAX_WAVES; index += 1) {
        const wave = waves[index]
        if (wave) {
          uniformWaves[index].set(wave.x, wave.y, wave.startTime, wave.amplitude)
        } else {
          uniformWaves[index].set(0, 0, -100, 0)
        }
      }

      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }

    frameId = window.requestAnimationFrame(animate)

    return () => {
      destroyed = true
      refreshBoardTextureRef.current = null
      if (frameId !== undefined) cancelAnimationFrame(frameId)
      if (rippleTimeoutId !== undefined) clearTimeout(rippleTimeoutId)
      resizeObserver.disconnect()
      container.removeEventListener('pointerdown', handlePointerDown)
      scene.remove(waterMesh)
      geometry.dispose()
      material.dispose()
      boardTexture.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      imageCache.clear()
    }
  }, [])

  return <div ref={containerRef} className='water-scene' aria-hidden='true' />
}
