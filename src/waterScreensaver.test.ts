import { describe, expect, it } from 'vitest'
import { probeWebGL } from './waterUtils'

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
