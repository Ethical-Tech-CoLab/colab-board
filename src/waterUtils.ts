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
