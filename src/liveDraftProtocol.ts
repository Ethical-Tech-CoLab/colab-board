import type { Point, StrokeItem } from './types'

export type LiveDraftEndReason = 'end' | 'cancel'

type LiveDraftStroke = Omit<StrokeItem, 'points'>
type LiveDraftPoint = [x: number, y: number, pressure: number, t: number]

export type LiveDraftUpdate =
  | {
      kind: 'start'
      clientId: string
      stroke: LiveDraftStroke
      points: LiveDraftPoint[]
    }
  | {
      kind: 'append'
      clientId: string
      points: LiveDraftPoint[]
    }
  | {
      kind: 'end'
      clientId: string
    }
  | {
      kind: 'cancel'
      clientId: string
    }

export interface LiveDraftCursor {
  strokeId: string
  pointCount: number
}

export interface LiveDraftTransition {
  cursor: LiveDraftCursor | null
  update: LiveDraftUpdate | null
}

function isDraftPoint(value: unknown): value is LiveDraftPoint {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((part) => typeof part === 'number' && Number.isFinite(part))
  )
}

function encodePoint(point: Point): LiveDraftPoint {
  return [
    Math.round(point.x * 10),
    Math.round(point.y * 10),
    Math.round(point.pressure * 255),
    Math.round(point.t),
  ]
}

function decodePoint(point: LiveDraftPoint): Point {
  return {
    x: point[0] / 10,
    y: point[1] / 10,
    pressure: point[2] / 255,
    t: point[3],
  }
}

function isDraftStroke(value: unknown): value is LiveDraftStroke {
  if (!value || typeof value !== 'object') return false
  const stroke = value as Partial<LiveDraftStroke> & { points?: unknown }
  return (
    stroke.type === 'stroke' &&
    stroke.points === undefined &&
    typeof stroke.id === 'string' &&
    typeof stroke.createdAt === 'number' &&
    typeof stroke.color === 'string' &&
    typeof stroke.width === 'number' &&
    typeof stroke.opacity === 'number' &&
    typeof stroke.duration === 'number'
  )
}

export function isLiveDraftUpdate(value: unknown): value is LiveDraftUpdate {
  if (!value || typeof value !== 'object') return false
  const update = value as Partial<LiveDraftUpdate>
  if (typeof update.clientId !== 'string' || typeof update.kind !== 'string') {
    return false
  }
  if (update.kind === 'start') {
    return (
      isDraftStroke(update.stroke) &&
      Array.isArray(update.points) &&
      update.points.length > 0 &&
      update.points.every(isDraftPoint)
    )
  }
  if (update.kind === 'append') {
    return (
      Array.isArray(update.points) &&
      update.points.length > 0 &&
      update.points.every(isDraftPoint)
    )
  }
  return update.kind === 'end' || update.kind === 'cancel'
}

export function createLiveDraftTransition(
  cursor: LiveDraftCursor | null,
  draft: StrokeItem | null,
  clientId: string,
  reason: LiveDraftEndReason = 'end',
): LiveDraftTransition {
  if (!draft) {
    return cursor
      ? {
          cursor: null,
          update: {
            kind: reason,
            clientId,
          },
        }
      : { cursor: null, update: null }
  }

  if (
    !cursor ||
    cursor.strokeId !== draft.id ||
    cursor.pointCount > draft.points.length
  ) {
    const stroke: LiveDraftStroke = {
      id: draft.id,
      type: 'stroke',
      color: draft.color,
      width: draft.width,
      opacity: draft.opacity,
      duration: draft.duration,
      createdAt: draft.createdAt,
      ...(draft.effect ? { effect: draft.effect } : {}),
      ...(draft.seed !== undefined ? { seed: draft.seed } : {}),
      ...(draft.spatial ? { spatial: draft.spatial } : {}),
    }
    const points = draft.points.map(encodePoint)
    return {
      cursor: { strokeId: draft.id, pointCount: points.length },
      update:
        points.length > 0
          ? {
              kind: 'start',
              clientId,
              stroke,
              points,
            }
          : null,
    }
  }

  const points = draft.points.slice(cursor.pointCount).map(encodePoint)
  return {
    cursor: { strokeId: draft.id, pointCount: draft.points.length },
    update:
      points.length > 0
        ? {
            kind: 'append',
            clientId,
            points,
          }
        : null,
  }
}

export function applyLiveDraftUpdate(
  current: StrokeItem | undefined,
  update: LiveDraftUpdate,
): StrokeItem | undefined {
  if (update.kind === 'start') {
    return { ...update.stroke, points: update.points.map(decodePoint) }
  }
  if (update.kind === 'end' || update.kind === 'cancel') {
    return undefined
  }
  if (!current) return current
  const points = update.points.map(decodePoint)
  return {
    ...current,
    points: [...current.points, ...points],
    duration: Math.max(
      current.duration,
      points.at(-1)?.t ?? current.duration,
    ),
  }
}

export function coalesceLiveDraftUpdate(
  current: LiveDraftUpdate | undefined,
  next: LiveDraftUpdate,
): LiveDraftUpdate {
  if (!current || next.kind !== 'append') return next
  if (
    current.kind === 'start' &&
    current.clientId === next.clientId
  ) {
    return { ...current, points: [...current.points, ...next.points] }
  }
  if (
    current.kind === 'append' &&
    current.clientId === next.clientId
  ) {
    return { ...current, points: [...current.points, ...next.points] }
  }
  return next
}

export function withLiveDraftClientId(
  update: LiveDraftUpdate,
  clientId: string,
): LiveDraftUpdate {
  return { ...update, clientId }
}
