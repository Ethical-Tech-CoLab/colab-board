import type {
  Camera,
  WaterDropFrequency,
  WaterDropLocation,
  WaterDisturbancePreset,
  WaterIntensity,
  WaterWaveSpeed,
} from './types'

export type {
  WaterDropFrequency,
  WaterDropLocation,
  WaterDisturbancePreset,
  WaterIntensity,
  WaterWaveSpeed,
}

/**
 * Probe whether a WebGL(2) rendering context can be obtained before any
 * Three.js objects are allocated.  Accepts an injectable canvas factory so
 * unit tests can exercise both branches without a real GPU.
 */
export function probeWebGL(
  canvasFactory: () => HTMLCanvasElement = () =>
    globalThis.document.createElement('canvas'),
): boolean {
  try {
    const canvas = canvasFactory()
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Water screensaver configuration utilities
// ---------------------------------------------------------------------------

/** Min/max millisecond range for the scheduled-drop timer per frequency level */
export const FREQUENCY_RANGES: Record<WaterDropFrequency, [number, number]> = {
  slow:   [8_000, 16_000],
  medium: [3_000,  6_000],
  fast:   [  900,  2_500],
}

/** Return a random delay (ms) for a given frequency level */
export function randomDropDelay(frequency: WaterDropFrequency): number {
  const [min, max] = FREQUENCY_RANGES[frequency]
  return min + Math.random() * (max - min)
}

/** Global uAmplitude shader uniform value per intensity level */
export const INTENSITY_AMPLITUDE: Record<WaterIntensity, number> = {
  subtle: 0.07,
  medium: 0.12,
  strong: 0.20,
}

export const WAVE_SPEED_MULTIPLIER: Record<WaterWaveSpeed, number> = {
  half: 0.5,
  normal: 1,
  double: 2,
}

export function getWaveAge(
  elapsedSeconds: number,
  speed: WaterWaveSpeed,
): number {
  return elapsedSeconds * WAVE_SPEED_MULTIPLIER[speed]
}

export interface DisturbanceParams {
  /** Min and max per-wave amplitude sent into the wave function (w.w in shader) */
  minAmplitude: number
  maxAmplitude: number
}

export const DISTURBANCE_PRESET_PARAMS: Record<WaterDisturbancePreset, DisturbanceParams> = {
  ripple: { minAmplitude: 0.45, maxAmplitude: 0.72 },
  drop:   { minAmplitude: 0.72, maxAmplitude: 1.00 },
  splash: { minAmplitude: 0.88, maxAmplitude: 1.00 },
}

/** Return a random per-wave amplitude value for the given disturbance preset */
export function randomWaveAmplitude(preset: WaterDisturbancePreset): number {
  const { minAmplitude, maxAmplitude } = DISTURBANCE_PRESET_PARAMS[preset]
  return minAmplitude + Math.random() * (maxAmplitude - minAmplitude)
}

/**
 * Clamp and coerce a raw preference value to a valid disturbance count (1 | 2 | 3).
 * Accepts any unknown value coming from localStorage.
 */
export function normalizeDisturbanceCount(raw: unknown): 1 | 2 | 3 {
  if (raw === 2 || raw === '2') return 2
  if (raw === 3 || raw === '3') return 3
  return 1
}

/**
 * Resolve a single drop origin in plane coords (x, y ∈ [-1, 1]) for the
 * given location strategy.
 *
 * Accepts item positions already mapped to plane coordinates so the function
 * stays pure and testable without any board/Three.js dependencies.
 * Pass an injectable `rand` (defaults to Math.random) for deterministic tests.
 *
 * Returns null when `board-objects` is chosen but no items are present.
 */
export function resolveDropPosition(
  location: WaterDropLocation,
  randomOverride: boolean,
  itemPlanePositions: ReadonlyArray<{ x: number; y: number }>,
  rand: () => number = Math.random,
): { x: number; y: number } | null {
  // 20% chance to substitute a fully-random position when override is enabled.
  if (randomOverride && location === 'board-objects' && rand() < 0.20) {
    return { x: (rand() * 2 - 1) * 0.9, y: (rand() * 2 - 1) * 0.9 }
  }

  switch (location) {
    case 'board-objects': {
      if (itemPlanePositions.length === 0) return null
      return itemPlanePositions[Math.floor(rand() * itemPlanePositions.length)]
    }
    case 'center': {
      const jitter = 0.18
      return {
        x: (rand() - 0.5) * jitter * 2,
        y: (rand() - 0.5) * jitter * 2,
      }
    }
    case 'edges': {
      const edge = Math.floor(rand() * 4)
      const t = rand() * 2 - 1
      const margin = 0.85
      if (edge === 0) return { x: t, y: -margin }
      if (edge === 1) return { x: t, y: margin }
      if (edge === 2) return { x: -margin, y: t }
      return { x: margin, y: t }
    }
    case 'random':
    default:
      return { x: (rand() * 2 - 1) * 0.9, y: (rand() * 2 - 1) * 0.9 }
  }
}

// ---------------------------------------------------------------------------
// Texture-sizing helpers
// ---------------------------------------------------------------------------

/** Maximum pixel dimension for the board texture (longer axis). */
export const WATER_TEXTURE_MAX_DIM = 1024

/**
 * Compute board-texture pixel dimensions whose aspect ratio matches the water
 * plane's XZ footprint (= viewport aspect ratio).
 *
 * Keeping texture-aspect === plane-aspect ensures UV [0,1]×[0,1] maps content
 * proportionally: a viewport-width/viewport-height ratio plane uses a texture
 * of that same ratio, so objects on the board appear undistorted.
 *
 * The longer axis is capped at `maxDim` (default 1024):
 *   landscape (A ≥ 1): width = maxDim, height = round(maxDim / A)
 *   portrait  (A < 1): width = round(maxDim * A), height = maxDim
 */
export function computeTextureDimensions(
  viewportAspect: number,
  maxDim = WATER_TEXTURE_MAX_DIM,
): { width: number; height: number } {
  if (viewportAspect >= 1) {
    return {
      width: maxDim,
      height: Math.max(1, Math.round(maxDim / viewportAspect)),
    }
  }
  return {
    width: Math.max(1, Math.round(maxDim * viewportAspect)),
    height: maxDim,
  }
}

export interface WaterViewportLayout {
  halfWidth: number
  halfHeight: number
  planeScaleX: number
  planeScaleZ: number
}

/**
 * Matches an orthographic camera and water plane to the viewport so the board
 * remains full bleed without perspective compression or exposed plane edges.
 */
export function computeWaterViewportLayout(
  viewportAspect: number,
): WaterViewportLayout {
  if (viewportAspect >= 1) {
    return {
      halfWidth: viewportAspect,
      halfHeight: 1,
      planeScaleX: viewportAspect,
      planeScaleZ: 1,
    }
  }
  return {
    halfWidth: 1,
    halfHeight: 1 / viewportAspect,
    planeScaleX: 1,
    planeScaleZ: 1 / viewportAspect,
  }
}

export function scaleCameraToRenderWidth(
  camera: Camera,
  renderWidth: number,
  viewportWidth: number,
): Camera {
  const ratio = renderWidth / viewportWidth
  return {
    x: camera.x * ratio,
    y: camera.y * ratio,
    scale: camera.scale * ratio,
  }
}
