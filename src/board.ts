import type {
  BoardDocument,
  BoardItem,
  Camera,
  ImageItem,
  NoteItem,
  StrokeItem,
  SpatialTransform,
  TimelineEvent,
} from './types'

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, scale: 1 }
export const DEFAULT_SPATIAL_TRANSFORM: SpatialTransform = {
  depth: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 1,
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
  fallback = 0,
): number {
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback
}

export function getSpatialTransform(item: BoardItem): SpatialTransform {
  const spatial = item.spatial
  return {
    depth: clamp(spatial?.depth ?? 0, -500, 500),
    rotationX: clamp(spatial?.rotationX ?? 0, -70, 70),
    rotationY: clamp(spatial?.rotationY ?? 0, -70, 70),
    rotationZ: clamp(spatial?.rotationZ ?? 0, -180, 180),
    scale: clamp(spatial?.scale ?? 1, 0.4, 2.4, 1),
  }
}

export function withSpatialTransform(
  item: BoardItem,
  values: Partial<SpatialTransform>,
): BoardItem {
  return {
    ...item,
    spatial: getSpatialTransform({
      ...item,
      spatial: { ...getSpatialTransform(item), ...values },
    }),
  }
}

export function createId(prefix = 'item'): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function createBoard(): BoardDocument {
  const now = Date.now()
  return {
    version: 1,
    id: createId('board'),
    title: 'Untitled thinking space',
    author: '',
    createdAt: now,
    updatedAt: now,
    watermark: 'Ethical Tech CoLab',
    items: [],
    timeline: [],
  }
}

export function applyItemEvent(
  items: BoardItem[],
  event: TimelineEvent,
): BoardItem[] {
  switch (event.type) {
    case 'add':
      return [...items.filter((item) => item.id !== event.item.id), event.item]
    case 'update':
      return items.map((item) =>
        item.id === event.item.id ? event.item : item,
      )
    case 'delete':
      return items.filter((item) => item.id !== event.itemId)
    case 'clear':
      return []
    case 'camera':
      return items
  }
}

export function replayAt(
  timeline: TimelineEvent[],
  elapsed: number,
): { items: BoardItem[]; camera: Camera } {
  if (timeline.length === 0) {
    return { items: [], camera: DEFAULT_CAMERA }
  }

  const sorted = [...timeline].sort((a, b) => a.at - b.at)
  const startedAt = sorted[0].at
  const cutoff = startedAt + Math.max(0, elapsed)
  let items: BoardItem[] = []
  let camera = DEFAULT_CAMERA

  for (const event of sorted) {
    if (event.at > cutoff) break
    if (event.type === 'camera') {
      camera = event.camera
      continue
    }

    if (
      event.type === 'add' &&
      event.item.type === 'stroke' &&
      cutoff < event.at + event.item.duration
    ) {
      const visibleFor = cutoff - event.at
      const partial = {
        ...event.item,
        points: event.item.points.filter((point) => point.t <= visibleFor),
      }
      if (partial.points.length > 0) {
        items = applyItemEvent(items, { ...event, item: partial })
      }
      continue
    }

    items = applyItemEvent(items, event)
  }

  return { items, camera }
}

export function getReplayTimelineSinceLastClear(
  timeline: TimelineEvent[],
): TimelineEvent[] {
  const lastClearIndex = timeline.findLastIndex((event) => event.type === 'clear')
  return lastClearIndex >= 0 ? timeline.slice(lastClearIndex + 1) : timeline
}

export function getReplayDuration(timeline: TimelineEvent[]): number {
  if (timeline.length === 0) return 0
  const start = Math.min(...timeline.map((event) => event.at))
  const end = Math.max(
    ...timeline.map((event) =>
      event.type === 'add' && event.item.type === 'stroke'
        ? event.at + event.item.duration
        : event.at,
    ),
  )
  return Math.max(1200, end - start)
}

export function getReplayFade(
  elapsed: number,
  playbackDuration: number,
  fadeDuration: number,
): number {
  if (elapsed <= playbackDuration) return 1
  if (fadeDuration <= 0) return 0
  return Math.max(
    0,
    Math.min(1, 1 - (elapsed - playbackDuration) / fadeDuration),
  )
}

export function getAmbientReplayCamera(
  camera: Camera,
  elapsed: number,
  viewport: { width: number; height: number },
): Camera {
  const phase = elapsed / 2_800
  const scale = camera.scale * (1 + Math.sin(phase * 0.61) * 0.025)
  const centerX = viewport.width / 2
  const centerY = viewport.height / 2

  return {
    scale,
    x:
      centerX -
      ((centerX - camera.x) / camera.scale) * scale +
      Math.sin(phase) * 22,
    y:
      centerY -
      ((centerY - camera.y) / camera.scale) * scale +
      Math.sin(phase * 0.73) * 15,
  }
}

export function getItemBounds(item: BoardItem): {
  x: number
  y: number
  width: number
  height: number
} {
  if (item.type !== 'stroke') {
    return {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    }

  }

  if (item.points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const xs = item.points.map((point) => point.x)
  const ys = item.points.map((point) => point.y)
  const padding = item.width / 2
  const minX = Math.min(...xs) - padding
  const minY = Math.min(...ys) - padding
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX + padding,
    height: Math.max(...ys) - minY + padding,
  }
}

export function placeItemsAtCenter(
  items: BoardItem[],
  center: { x: number; y: number },
  now = Date.now(),
): BoardItem[] {
  if (items.length === 0) return []
  const bounds = items.map(getItemBounds)
  const left = Math.min(...bounds.map((itemBounds) => itemBounds.x))
  const top = Math.min(...bounds.map((itemBounds) => itemBounds.y))
  const right = Math.max(
    ...bounds.map((itemBounds) => itemBounds.x + itemBounds.width),
  )
  const bottom = Math.max(
    ...bounds.map((itemBounds) => itemBounds.y + itemBounds.height),
  )
  const offsetX = center.x - (left + right) / 2
  const offsetY = center.y - (top + bottom) / 2

  return items.map((item, index) => {
    const base = {
      ...item,
      id: createId(item.type),
      createdAt: now + index,
    }
    if (base.type === 'stroke') {
      return {
        ...base,
        points: base.points.map((point) => ({
          ...point,
          x: point.x + offsetX,
          y: point.y + offsetY,
        })),
      }
    }
    return {
      ...base,
      x: base.x + offsetX,
      y: base.y + offsetY,
    }
  })
}

export function hitTest(
  items: BoardItem[],
  x: number,
  y: number,
  tolerance: number,
): BoardItem | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.type === 'stroke') {
      if (
        item.points.some(
          (point) => Math.hypot(point.x - x, point.y - y) <= tolerance,
        )
      ) {
        return item
      }
      continue
    }

    if (
      x >= item.x - tolerance &&
      x <= item.x + item.width + tolerance &&
      y >= item.y - tolerance &&
      y <= item.y + item.height + tolerance
    ) {
      return item
    }
  }
}

export function isBoardDocument(value: unknown): value is BoardDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BoardDocument>
  return (
    candidate.version === 1 &&
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.createdAt === 'number' &&
    Array.isArray(candidate.items) &&
    Array.isArray(candidate.timeline)
  )
}

export function createNote(
  x: number,
  y: number,
  color = '#ffe39a',
): NoteItem {
  return {
    id: createId('note'),
    type: 'note',
    x,
    y,
    width: 240,
    height: 176,
    text: '',
    color,
    createdAt: Date.now(),
  }
}

export function fitImage(
  src: string,
  name: string,
  naturalWidth: number,
  naturalHeight: number,
  center: { x: number; y: number },
): ImageItem {
  const maxSize = 480
  const ratio = Math.min(1, maxSize / Math.max(naturalWidth, naturalHeight))
  const width = Math.max(80, naturalWidth * ratio)
  const height = Math.max(80, naturalHeight * ratio)
  return {
    id: createId('image'),
    type: 'image',
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    src,
    name,
    createdAt: Date.now(),
  }
}

export function cloneItem<T extends BoardItem>(item: T): T {
  return structuredClone(item)
}

export function strokeAsEvent(item: StrokeItem): TimelineEvent {
  return {
    id: createId('event'),
    type: 'add',
    at: item.createdAt,
    item,
  }
}
