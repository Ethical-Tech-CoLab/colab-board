/** Orbit radius (px) → CSS `--radius` custom property. */
export function galaxyOrbitRadius(index: number): number {
  return 45 + index * 10
}

/** Rotation-pivot x offset (px) → CSS `--origin` custom property. */
export function galaxyOrbitOriginX(index: number): number {
  return 70 + index * 8
}
