import { describe, expect, it } from 'vitest'
import {
  probeWebGL,
  randomDropDelay,
  FREQUENCY_RANGES,
  INTENSITY_AMPLITUDE,
  DISTURBANCE_PRESET_PARAMS,
  randomWaveAmplitude,
  normalizeDisturbanceCount,
  resolveDropPosition,
  getWaveAge,
  WAVE_SPEED_MULTIPLIER,
  computeTextureDimensions,
  computeWaterViewportLayout,
  scaleCameraToRenderWidth,
  WATER_TEXTURE_MAX_DIM,
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

  describe('water wave speed presets', () => {
    it('defaults can use half speed to make waves take twice as long', () => {
      expect(WAVE_SPEED_MULTIPLIER.half).toBe(0.5)
      expect(getWaveAge(10, 'half')).toBe(5)
    })

    it('preserves original and double-speed options', () => {
      expect(getWaveAge(10, 'normal')).toBe(10)
      expect(getWaveAge(10, 'double')).toBe(20)
    })
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

// ---------------------------------------------------------------------------
// resolveDropPosition — deterministic tests via injected rand
// ---------------------------------------------------------------------------

/** Build a deterministic rand() that returns values from a fixed sequence. */
function seqRand(...values: number[]): () => number {
  let index = 0
  return () => values[index++] ?? 0.5
}

describe('resolveDropPosition — board-objects', () => {
  const items = [
    { x: 0.3, y: 0.4 },
    { x: -0.2, y: 0.5 },
  ]

  it('returns null when no items are present', () => {
    expect(resolveDropPosition('board-objects', false, [], seqRand(0.5))).toBeNull()
  })

  it('picks the first item when rand returns 0', () => {
    expect(resolveDropPosition('board-objects', false, items, seqRand(0))).toEqual(
      items[0],
    )
  })

  it('picks the last item when rand is just below 1', () => {
    expect(resolveDropPosition('board-objects', false, items, seqRand(0.99))).toEqual(
      items[1],
    )
  })
})

describe('resolveDropPosition — random override', () => {
  const items = [{ x: 0.3, y: 0.4 }]

  it('substitutes a random position when rand() < 0.20 and override is true', () => {
    // rand sequence: override check (0.10 triggers) → x rand (0.5) → y rand (0.5)
    // x = (0.5*2-1)*0.9 = 0,  y = 0
    const result = resolveDropPosition(
      'board-objects', true, items, seqRand(0.10, 0.5, 0.5),
    )
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('uses board item when rand() >= 0.20 even with override enabled', () => {
    // rand sequence: override check (0.25 does not trigger) → item pick (0 → index 0)
    const result = resolveDropPosition(
      'board-objects', true, items, seqRand(0.25, 0),
    )
    expect(result).toEqual(items[0])
  })

  it('ignores low rand() when override is false', () => {
    // rand() < 0.20 but override=false → still picks board item
    const result = resolveDropPosition(
      'board-objects', false, items, seqRand(0.10, 0),
    )
    expect(result).toEqual(items[0])
  })
})

describe('resolveDropPosition — center', () => {
  it('returns origin when rand() is 0.5 (no jitter)', () => {
    // (0.5-0.5)*0.36 = 0 for both axes
    expect(resolveDropPosition('center', false, [], seqRand(0.5, 0.5))).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('applies jitter within the declared ±0.18 range', () => {
    const result = resolveDropPosition('center', false, [], Math.random)
    expect(result!.x).toBeGreaterThanOrEqual(-0.18)
    expect(result!.x).toBeLessThanOrEqual(0.18)
    expect(result!.y).toBeGreaterThanOrEqual(-0.18)
    expect(result!.y).toBeLessThanOrEqual(0.18)
  })
})

describe('resolveDropPosition — edges', () => {
  it('places drop on edge 0 (bottom) with rand=[0, 0]', () => {
    // edge=floor(0*4)=0, t=0*2-1=-1 → {x:-1, y:-0.85}
    expect(resolveDropPosition('edges', false, [], seqRand(0, 0))).toEqual({
      x: -1,
      y: -0.85,
    })
  })

  it('places drop on edge 1 (top) with rand=[0.25, 0.75]', () => {
    // edge=floor(0.25*4)=1, t=0.75*2-1=0.5 → {x:0.5, y:0.85}
    expect(resolveDropPosition('edges', false, [], seqRand(0.25, 0.75))).toEqual({
      x: 0.5,
      y: 0.85,
    })
  })

  it('places drop on edge 2 (left) with rand=[0.5, 0.5]', () => {
    // edge=floor(0.5*4)=2, t=0.5*2-1=0 → {x:-0.85, y:0}
    expect(resolveDropPosition('edges', false, [], seqRand(0.5, 0.5))).toEqual({
      x: -0.85,
      y: 0,
    })
  })

  it('places drop on edge 3 (right) with rand=[0.75, 0.5]', () => {
    // edge=floor(0.75*4)=3, t=0.5*2-1=0 → {x:0.85, y:0}
    expect(resolveDropPosition('edges', false, [], seqRand(0.75, 0.5))).toEqual({
      x: 0.85,
      y: 0,
    })
  })
})

describe('resolveDropPosition — random', () => {
  it('returns origin (0, 0) when rand() is 0.5', () => {
    // (0.5*2-1)*0.9 = 0
    expect(resolveDropPosition('random', false, [], seqRand(0.5, 0.5))).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('clamps result within ±0.9', () => {
    const result = resolveDropPosition('random', false, [], Math.random)
    expect(result!.x).toBeGreaterThanOrEqual(-0.9)
    expect(result!.x).toBeLessThanOrEqual(0.9)
  })
})

// ---------------------------------------------------------------------------
// computeTextureDimensions — aspect-ratio / plane / texture sizing
// ---------------------------------------------------------------------------

describe('computeTextureDimensions', () => {
  it('returns square 1024×1024 for a 1:1 aspect ratio', () => {
    expect(computeTextureDimensions(1)).toEqual({ width: 1024, height: 1024 })
  })

  it('keeps width at maxDim and reduces height for 16:9 landscape', () => {
    const { width, height } = computeTextureDimensions(16 / 9)
    expect(width).toBe(WATER_TEXTURE_MAX_DIM)
    expect(height).toBe(Math.round(WATER_TEXTURE_MAX_DIM / (16 / 9))) // 576
    // Resulting ratio should match the viewport aspect within 1 pixel of rounding
    expect(width / height).toBeCloseTo(16 / 9, 1)
  })

  it('keeps height at maxDim and reduces width for 9:16 portrait', () => {
    const { width, height } = computeTextureDimensions(9 / 16)
    expect(height).toBe(WATER_TEXTURE_MAX_DIM)
    expect(width).toBe(Math.round(WATER_TEXTURE_MAX_DIM * (9 / 16))) // 576
    expect(height / width).toBeCloseTo(16 / 9, 1)
  })

  it('keeps width at maxDim and reduces height for 4:3', () => {
    const { width, height } = computeTextureDimensions(4 / 3)
    expect(width).toBe(WATER_TEXTURE_MAX_DIM)
    expect(height).toBe(Math.round(WATER_TEXTURE_MAX_DIM / (4 / 3))) // 768
    expect(width / height).toBeCloseTo(4 / 3, 1)
  })

  it('never returns a zero dimension', () => {
    // Extreme aspect ratios (ultra-wide or ultra-tall)
    const landscape = computeTextureDimensions(5)
    const portrait = computeTextureDimensions(0.1)
    expect(landscape.height).toBeGreaterThanOrEqual(1)
    expect(portrait.width).toBeGreaterThanOrEqual(1)
  })

  it('respects a custom maxDim', () => {
    const { width, height } = computeTextureDimensions(2, 512)
    expect(width).toBe(512)
    expect(height).toBe(256)
  })

  it('ensures texture × viewport-aspect eliminates distortion for 16:9', () => {
    // The distortion factor equals (texW/texH) / viewportAspect; it should be 1.
    const viewportAspect = 16 / 9
    const { width, height } = computeTextureDimensions(viewportAspect)
    const texAspect = width / height
    expect(texAspect).toBeCloseTo(viewportAspect, 1)
  })
})

describe('computeWaterViewportLayout', () => {
  it.each([16 / 9, 4 / 3, 1, 9 / 16])(
    'fills an aspect ratio of %f without overscan or exposed edges',
    (aspect) => {
      const layout = computeWaterViewportLayout(aspect)
      expect(layout.planeScaleX).toBe(layout.halfWidth)
      expect(layout.planeScaleZ).toBe(layout.halfHeight)
      expect(layout.halfWidth / layout.halfHeight).toBeCloseTo(aspect)
    },
  )
})

describe('scaleCameraToRenderWidth', () => {
  it('preserves screen composition when rendering to a smaller texture', () => {
    expect(
      scaleCameraToRenderWidth({ x: 320, y: 180, scale: 1.5 }, 1024, 1600),
    ).toEqual({ x: 204.8, y: 115.2, scale: 0.96 })
  })
})
