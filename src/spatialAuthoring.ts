import { getSpatialTransform } from './board'
import { getPenButtonAction } from './surfacePointer'
import type {
  BoardItem,
  Point,
  SpatialTransform,
  Tool,
} from './types'

export const SPATIAL_WORLD_SCALE = 0.01
export const SPATIAL_LAYER_STEP = 0.035

export type SpatialInputAction =
  | 'draw'
  | 'erase'
  | 'navigate'
  | 'note'
  | 'select'
  | 'ignore'

interface SpatialPointerState {
  pointerType: string
  button: number
  buttons: number
}

export function getSpatialInputAction(
  pointer: SpatialPointerState,
  tool: Tool,
  touchMode: 'pan' | 'draw',
): SpatialInputAction {
  const penAction = getPenButtonAction(pointer)
  if (pointer.pointerType === 'pen') {
    if (penAction === 'eraser') return 'erase'
    if (penAction === 'barrel') return 'navigate'
    if (penAction === 'none') return 'ignore'
  }
  if (tool === 'pan' || pointer.button === 1 || pointer.button === 2) {
    return 'navigate'
  }
  if (pointer.pointerType === 'touch' && touchMode === 'pan') return 'navigate'
  if (pointer.button !== 0) return 'ignore'
  if (tool === 'pen' || tool === 'highlighter') return 'draw'
  if (tool === 'eraser') return 'erase'
  if (tool === 'note') return 'note'
  return 'select'
}

export function spatialLayerOffset(itemId?: string): number {
  if (!itemId) return 0
  let hash = 2_166_136_261
  for (let index = 0; index < itemId.length; index += 1) {
    hash ^= itemId.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return ((hash >>> 0) / 0xffffffff - 0.5) * SPATIAL_LAYER_STEP
}

export function spatialPlaneZ(depth: number, itemId?: string): number {
  return depth * SPATIAL_WORLD_SCALE + spatialLayerOffset(itemId)
}

export function spatialTransformAtDepth(depth: number): SpatialTransform {
  return {
    depth: Math.min(500, Math.max(-500, depth)),
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scale: 1,
  }
}

export function spatialItemVersion(item: BoardItem): string {
  const spatial = getSpatialTransform(item)
  const transform = [
    spatial.depth,
    spatial.rotationX,
    spatial.rotationY,
    spatial.rotationZ,
    spatial.scale,
  ]
  if (item.type === 'stroke') {
    return JSON.stringify([
      item.id,
      item.points.length,
      item.points[0],
      item.points.at(-1),
      item.color,
      item.width,
      item.opacity,
      item.duration,
      item.effect,
      item.seed,
      transform,
    ])
  }
  if (item.type === 'note') {
    return JSON.stringify([
      item.id,
      item.x,
      item.y,
      item.width,
      item.height,
      item.text,
      item.color,
      transform,
    ])
  }
  return JSON.stringify([
    item.id,
    item.x,
    item.y,
    item.width,
    item.height,
    item.name,
    item.src.length,
    item.src.slice(-24),
    transform,
  ])
}

export function spatialWorldToBoardPoint(
  world: { x: number; y: number },
  origin: { x: number; y: number },
): Pick<Point, 'x' | 'y'> {
  return {
    x: origin.x + world.x / SPATIAL_WORLD_SCALE,
    y: origin.y - world.y / SPATIAL_WORLD_SCALE,
  }
}
