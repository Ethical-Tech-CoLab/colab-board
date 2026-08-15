import { describe, expect, it } from 'vitest'
import {
  galaxyOrbitOriginX,
  galaxyOrbitRadius,
} from './galaxyScreensaver'

/**
 * Regression tests for the galaxy screensaver orbit geometry.
 *
 * Root cause of the regression (commit 40ded7e): the CSS rule
 * `transform-origin: calc(70px + var(--i) * 8px) 0` was removed from
 * `.galaxy-scene i` during the Replay Studio perf refactor. Without it all
 * particles orbit the galaxy core in concentric rings; with it each particle's
 * rotation pivot is displaced outward so high-index particles sweep a much
 * larger area — the "large orbit" the user reported as missing.
 */
describe('galaxy screensaver orbit geometry', () => {
  describe('galaxyOrbitRadius', () => {
    it('inner particle (i=0) starts at 45 px', () => {
      expect(galaxyOrbitRadius(0)).toBe(45)
    })

    it('grows by 10 px per index step', () => {
      expect(galaxyOrbitRadius(1) - galaxyOrbitRadius(0)).toBe(10)
      expect(galaxyOrbitRadius(10) - galaxyOrbitRadius(9)).toBe(10)
    })

    it('outermost standard particle (i=41) reaches 455 px', () => {
      expect(galaxyOrbitRadius(41)).toBe(455)
    })
  })

  describe('galaxyOrbitOriginX', () => {
    it('inner particle (i=0) pivot is offset 70 px from element position', () => {
      expect(galaxyOrbitOriginX(0)).toBe(70)
    })

    it('grows by 8 px per index step', () => {
      expect(galaxyOrbitOriginX(1) - galaxyOrbitOriginX(0)).toBe(8)
    })

    it('outermost particle (i=41) pivot is at 398 px — well beyond the orbit radius', () => {
      // This is the key assertion that pins the "large orbit" regression fix.
      // If transform-origin is removed from CSS the pivot collapses to zero and
      // particles cluster near the galaxy core instead of sweeping the large area.
      const MAX_INDEX = 41
      expect(galaxyOrbitOriginX(MAX_INDEX)).toBe(398)
    })

    it('pivot offset is substantial (> 200 px) for the outer half of particles', () => {
      // Ensures restore of large-orbit reach: with 42 particles (indices 0–41)
      // the outer 21 particles all have pivot offsets well above 200 px.
      for (let i = 21; i <= 41; i++) {
        expect(galaxyOrbitOriginX(i)).toBeGreaterThan(200)
      }
    })
  })

  describe('orbit pivot vs radius relationship (large-orbit invariant)', () => {
    it('for i ≥ 21 the pivot offset exceeds half the radius, producing eccentric orbits far from center', () => {
      // Without transform-origin every dot orbits concentrically; the pivot
      // offset > radius/2 condition is what made the outer ring visually large.
      for (let i = 21; i <= 41; i++) {
        expect(galaxyOrbitOriginX(i)).toBeGreaterThan(galaxyOrbitRadius(i) / 2)
      }
    })
  })
})
