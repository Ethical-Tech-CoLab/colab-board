import { isBoardDocument } from './board'
import type {
  BoardDocument,
  BoardItem,
  Camera,
  ImageItem,
  TimelineEvent,
} from './types'

export const LIVE_SESSION_PROTOCOL = 'ethical-tech-colab-live-v3'

export type LiveTimelineEvent =
  | {
      id: string
      type: 'add' | 'update'
      at: number
      itemId: string
      item?: BoardItem
    }
  | {
      id: string
      type: 'delete'
      at: number
      itemId: string
    }
  | {
      id: string
      type: 'clear'
      at: number
    }
  | {
      id: string
      type: 'camera'
      at: number
      camera: Camera
    }

export interface LiveBoardPatch {
  id: string
  sentAt: number
  updatedAt: number
  metadata: Partial<
    Pick<BoardDocument, 'title' | 'author' | 'watermark'>
  >
  upserts: BoardItem[]
  deletes: string[]
  timeline: LiveTimelineEvent[]
  reset?: BoardDocument
}

function itemChanged(previous: BoardItem | undefined, next: BoardItem): boolean {
  if (!previous) return true
  if (previous === next) return false
  return JSON.stringify(previous) !== JSON.stringify(next)
}

function createSyntheticTimeline(
  patchId: string,
  at: number,
  upserts: BoardItem[],
  newItemIds: Set<string>,
  deletes: string[],
  timeline: LiveTimelineEvent[],
): LiveTimelineEvent[] {
  const coveredItems = new Set<string>()
  let clearsItems = false
  for (const event of timeline) {
    if (event.type === 'add' || event.type === 'update') {
      coveredItems.add(event.itemId)
    } else if (event.type === 'delete') {
      coveredItems.add(event.itemId)
    } else if (event.type === 'clear') {
      clearsItems = true
    }
  }

  const synthetic: LiveTimelineEvent[] = []
  for (const item of upserts) {
    if (coveredItems.has(item.id)) continue
    synthetic.push({
      id: `${patchId}-upsert-${item.id}`,
      type: newItemIds.has(item.id) ? 'add' : 'update',
      at,
      itemId: item.id,
    })
  }
  if (!clearsItems) {
    for (const itemId of deletes) {
      if (coveredItems.has(itemId)) continue
      synthetic.push({
        id: `${patchId}-delete-${itemId}`,
        type: 'delete',
        at,
        itemId,
      })
    }
  }
  return synthetic
}

function compactTimeline(
  events: TimelineEvent[],
  upserts: BoardItem[],
): LiveTimelineEvent[] {
  const upsertsById = new Map(upserts.map((item) => [item.id, item]))
  return events.map((event) => {
    switch (event.type) {
      case 'add':
      case 'update': {
        const patchedItem = upsertsById.get(event.item.id)
        const compactEvent: Extract<
          LiveTimelineEvent,
          { type: 'add' | 'update' }
        > = {
          id: event.id,
          type: event.type,
          at: event.at,
          itemId: event.item.id,
        }
        return patchedItem === event.item
          ? compactEvent
          : { ...compactEvent, item: event.item }
      }
      case 'delete':
        return {
          id: event.id,
          type: 'delete',
          at: event.at,
          itemId: event.itemId,
        }
      case 'clear':
        return { id: event.id, type: 'clear', at: event.at }
      case 'camera':
        return {
          id: event.id,
          type: 'camera',
          at: event.at,
          camera: event.camera,
        }
    }
  })
}

export function createLiveBoardPatch(
  previous: BoardDocument,
  next: BoardDocument,
  id: string = crypto.randomUUID(),
  sentAt = Date.now(),
): LiveBoardPatch | null {
  if (
    previous.id !== next.id ||
    previous.version !== next.version ||
    previous.createdAt !== next.createdAt
  ) {
    return {
      id,
      sentAt,
      updatedAt: next.updatedAt,
      metadata: {},
      upserts: [],
      deletes: [],
      timeline: [],
      reset: next,
    }
  }

  const previousItems = new Map(
    previous.items.map((item) => [item.id, item]),
  )
  const nextIds = new Set(next.items.map((item) => item.id))
  const upserts = next.items.filter((item) =>
    itemChanged(previousItems.get(item.id), item),
  )
  const newItemIds = new Set(
    upserts
      .filter((item) => !previousItems.has(item.id))
      .map((item) => item.id),
  )
  const deletes = previous.items
    .filter((item) => !nextIds.has(item.id))
    .map((item) => item.id)

  const previousEventIds = new Set(previous.timeline.map((event) => event.id))
  const appendedTimeline = compactTimeline(
    next.timeline.filter((event) => !previousEventIds.has(event.id)),
    upserts,
  )
  const metadata: LiveBoardPatch['metadata'] = {}
  if (previous.title !== next.title) metadata.title = next.title
  if (previous.author !== next.author) metadata.author = next.author
  if (previous.watermark !== next.watermark) metadata.watermark = next.watermark

  if (
    upserts.length === 0 &&
    deletes.length === 0 &&
    appendedTimeline.length === 0 &&
    Object.keys(metadata).length === 0
  ) {
    return null
  }

  return {
    id,
    sentAt,
    updatedAt: next.updatedAt,
    metadata,
    upserts,
    deletes,
    timeline: [
      ...appendedTimeline,
      ...createSyntheticTimeline(
        id,
        next.updatedAt,
        upserts,
        newItemIds,
        deletes,
        appendedTimeline,
      ),
    ],
  }
}

export function applyLiveBoardPatch(
  board: BoardDocument,
  patch: LiveBoardPatch,
): BoardDocument {
  if (patch.reset) return patch.reset

  const upserts = new Map(patch.upserts.map((item) => [item.id, item]))
  const deletedIds = new Set(patch.deletes)
  const existingIds = new Set(board.items.map((item) => item.id))
  const items = board.items
    .filter((item) => !deletedIds.has(item.id))
    .map((item) => upserts.get(item.id) ?? item)

  for (const item of patch.upserts) {
    if (!existingIds.has(item.id)) items.push(item)
  }

  const eventIds = new Set(board.timeline.map((event) => event.id))
  const currentItems = new Map(items.map((item) => [item.id, item]))
  const expandedTimeline = patch.timeline.flatMap((event): TimelineEvent[] => {
    switch (event.type) {
      case 'add':
      case 'update': {
        const item =
          event.item ??
          upserts.get(event.itemId) ??
          currentItems.get(event.itemId)
        return item
          ? [{ id: event.id, type: event.type, at: event.at, item }]
          : []
      }
      case 'delete':
        return [
          {
            id: event.id,
            type: 'delete',
            at: event.at,
            itemId: event.itemId,
          },
        ]
      case 'clear':
        return [{ id: event.id, type: 'clear', at: event.at }]
      case 'camera':
        return [
          {
            id: event.id,
            type: 'camera',
            at: event.at,
            camera: event.camera,
          },
        ]
    }
  })
  const timeline = [
    ...board.timeline,
    ...expandedTimeline.filter((event) => !eventIds.has(event.id)),
  ]

  return {
    ...board,
    ...patch.metadata,
    updatedAt: Math.max(board.updatedAt, patch.updatedAt),
    items,
    timeline,
  }
}

export function applyLiveBoardPatches(
  board: BoardDocument,
  patches: LiveBoardPatch[],
): BoardDocument {
  return patches.reduce(applyLiveBoardPatch, board)
}

function isBoardItem(value: unknown): value is BoardItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<BoardItem>
  if (
    typeof item.id !== 'string' ||
    typeof item.createdAt !== 'number' ||
    typeof item.type !== 'string'
  ) {
    return false
  }
  if (item.type === 'stroke') {
    return (
      Array.isArray(item.points) &&
      typeof item.color === 'string' &&
      typeof item.width === 'number' &&
      typeof item.opacity === 'number' &&
      typeof item.duration === 'number'
    )
  }
  if (item.type !== 'note' && item.type !== 'image') return false
  if (
    typeof item.x !== 'number' ||
    typeof item.y !== 'number' ||
    typeof item.width !== 'number' ||
    typeof item.height !== 'number'
  ) {
    return false
  }
  if (item.type === 'note') {
    return typeof item.text === 'string' && typeof item.color === 'string'
  }
  const image = item as Partial<ImageItem>
  return typeof image.src === 'string' && typeof image.name === 'string'
}

function isTimelineEvent(value: unknown): value is LiveTimelineEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<TimelineEvent>
  if (
    typeof event.id !== 'string' ||
    typeof event.at !== 'number' ||
    typeof event.type !== 'string'
  ) {
    return false
  }
  if (event.type === 'add' || event.type === 'update') {
    const liveEvent = value as Partial<
      Extract<LiveTimelineEvent, { type: 'add' | 'update' }>
    >
    return (
      typeof liveEvent.itemId === 'string' &&
      (liveEvent.item === undefined || isBoardItem(liveEvent.item))
    )
  }
  if (event.type === 'delete') return typeof event.itemId === 'string'
  if (event.type === 'camera') {
    return (
      typeof event.camera?.x === 'number' &&
      typeof event.camera.y === 'number' &&
      typeof event.camera.scale === 'number'
    )
  }
  return event.type === 'clear'
}

export function isLiveBoardPatch(value: unknown): value is LiveBoardPatch {
  if (!value || typeof value !== 'object') return false
  const patch = value as Partial<LiveBoardPatch>
  if (
    typeof patch.id !== 'string' ||
    typeof patch.sentAt !== 'number' ||
    typeof patch.updatedAt !== 'number' ||
    !patch.metadata ||
    typeof patch.metadata !== 'object' ||
    !Array.isArray(patch.upserts) ||
    !patch.upserts.every(isBoardItem) ||
    !Array.isArray(patch.deletes) ||
    !patch.deletes.every((id) => typeof id === 'string') ||
    !Array.isArray(patch.timeline) ||
    !patch.timeline.every(isTimelineEvent)
  ) {
    return false
  }
  if (
    ('title' in patch.metadata &&
      typeof patch.metadata.title !== 'string') ||
    ('author' in patch.metadata &&
      typeof patch.metadata.author !== 'string') ||
    ('watermark' in patch.metadata &&
      typeof patch.metadata.watermark !== 'string')
  ) {
    return false
  }
  return patch.reset === undefined || isBoardDocument(patch.reset)
}
