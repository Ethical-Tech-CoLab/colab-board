import { describe, expect, it } from 'vitest'
import {
  probeWebGL,
  randomDropDelay,
  FREQUENCY_RANGES,
  INTENSITY_AMPLITUDE,
  DISTURBANCE_PRESET_PARAMS,
  randomWaveAmplitude,
  normalizeDisturbanceCount,
} from './waterUtils'

// Build a minimal HTMLCanvasElement-shaped stub that returns a fixed context.
// Using a plain object cast avoids jsdom quirks where assigning to
// canvas.getContext on a real element is silently ignored.
function makeCanvasStub(
  factory: (type: string) => RenderingContext | null,
): HTMLCanvasElement {
  return {
    getContext: (type: string) => factory(type),
  } as unknown as HTMLCanvasElement
}

describe('probeWebGL', () => {
  it('returns false when both context types return null', () => {
    expect(probeWebGL(() => makeCanvasStub(() => null))).toBe(false)
  })

  it('returns true when webgl2 is available', () => {
    expect(
      probeWebGL(() =>
        makeCanvasStub((t) => (t === 'webgl2' ? ({} as RenderingContext) : null)),
      ),
    ).toBe(true)
  })

  it('returns true when only webgl (v1) is available', () => {
    expect(
      probeWebGL(() =>
        makeCanvasStub((t) => (t === 'webgl' ? ({} as RenderingContext) : null)),
      ),
    ).toBe(true)
  })

  it('returns false when getContext throws synchronously', () => {
    expect(
      probeWebGL(() =>
        makeCanvasStub(() => {
          throw new Error('CONTEXT_LOST_WEBGL')
        }),
      ),
    ).toBe(false)
  })

  it('returns false when the canvas factory itself throws', () => {
    expect(
      probeWebGL(() => {
        throw new Error('createElement failed')
      }),
    ).toBe(false)
  })

  it('uses the default factory (jsdom returns null for WebGL — same as a no-GPU device)', () => {
    // jsdom does not implement WebGL; the default factory should therefore
    // return false, exactly mirroring a real headless or software-only device.
    expect(probeWebGL()).toBe(false)
  })
})

describe('water drop scheduling', () => {
  it('returns a delay within range for each frequency level', () => {
    for (const [frequency, [min, max]] of Object.entries(FREQUENCY_RANGES)) {
      const delay = randomDropDelay(frequency as keyof typeof FREQUENCY_RANGES)
      expect(delay).toBeGreaterThanOrEqual(min)
      expect(delay).toBeLessThanOrEqual(max)
    }
  })

  it('orders frequency ranges from slowest to fastest', () => {
    expect(FREQUENCY_RANGES.slow[0]).toBeGreaterThan(FREQUENCY_RANGES.medium[0])
    expect(FREQUENCY_RANGES.medium[0]).toBeGreaterThan(FREQUENCY_RANGES.fast[0])
  })
})

describe('water intensity presets', () => {
  it('scales wave height from subtle to strong', () => {
    expect(INTENSITY_AMPLITUDE.subtle).toBeLessThan(INTENSITY_AMPLITUDE.medium)
    expect(INTENSITY_AMPLITUDE.medium).toBeLessThan(INTENSITY_AMPLITUDE.strong)
  })
})

describe('wave disturbance presets', () => {
  it('returns an amplitude within range for each preset', () => {
    for (const [preset, { minAmplitude, maxAmplitude }] of Object.entries(
      DISTURBANCE_PRESET_PARAMS,
    )) {
      const amplitude = randomWaveAmplitude(
        preset as keyof typeof DISTURBANCE_PRESET_PARAMS,
      )
      expect(amplitude).toBeGreaterThanOrEqual(minAmplitude)
      expect(amplitude).toBeLessThanOrEqual(maxAmplitude)
    }
  })
})

describe('normalizeDisturbanceCount', () => {
  it('accepts valid numeric and string values', () => {
    expect(normalizeDisturbanceCount(1)).toBe(1)
    expect(normalizeDisturbanceCount(2)).toBe(2)
    expect(normalizeDisturbanceCount(3)).toBe(3)
    expect(normalizeDisturbanceCount('2')).toBe(2)
    expect(normalizeDisturbanceCount('3')).toBe(3)
  })

  it('falls back to one for invalid values', () => {
    expect(normalizeDisturbanceCount(undefined)).toBe(1)
    expect(normalizeDisturbanceCount(null)).toBe(1)
    expect(normalizeDisturbanceCount(0)).toBe(1)
    expect(normalizeDisturbanceCount('7')).toBe(1)
    expect(normalizeDisturbanceCount('oops')).toBe(1)
  })
})
