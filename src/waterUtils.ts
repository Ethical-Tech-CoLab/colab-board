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

export type WaterDropFrequency = 'slow' | 'medium' | 'fast'
export type WaterDisturbancePreset = 'ripple' | 'drop' | 'splash'
export type WaterIntensity = 'subtle' | 'medium' | 'strong'

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
