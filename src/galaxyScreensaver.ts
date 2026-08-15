/**
 * Pure helpers for galaxy screensaver orbit animation.
 *
 * The CSS `transform-origin` for each particle is `galaxyOrbitOriginX(i)px 0`.
 * That offset displaces the rotation pivot away from the galaxy core so outer
 * particles sweep at large distances from center — the "large orbit" effect.
 * Both values are kept here so unit tests can pin the formulas in one place.
 */

/** Orbit radius (px) passed as the CSS `--radius` custom property. */
export function galaxyOrbitRadius(index: number): number {
  return 45 + index * 10
}

/**
 * X offset (px) used for the CSS `transform-origin` of each orbit particle.
 * A large offset places the rotation pivot far from the galaxy core, which is
 * what produces the "larger orbit" appearance for high-index particles.
 */
export function galaxyOrbitOriginX(index: number): number {
  return 70 + index * 8
}
