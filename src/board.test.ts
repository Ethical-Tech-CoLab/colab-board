import { describe, expect, it } from 'vitest'
import {
  applyItemEvent,
  createBoard,
  getAmbientReplayCamera,
  getReplayDuration,
  getReplayTimelineSinceLastClear,
  getSpatialTransform,
  isBoardDocument,
  placeItemsAtCenter,
  replayAt,
  withSpatialTransform,
} from './board'
import { BRAND_THEMES } from './branding'
import type { NoteItem, StrokeItem, TimelineEvent } from './types'

const note: NoteItem = {
  id: 'note-1',
  type: 'note',
  x: 20,
  y: 30,
  width: 240,
  height: 176,
  text: 'Start here',
  color: '#ffe39a',
  createdAt: 1_000,
}

const stroke: StrokeItem = {
  id: 'stroke-1',
  type: 'stroke',
  points: [
    { x: 0, y: 0, pressure: 0.5, t: 0 },
    { x: 10, y: 10, pressure: 0.7, t: 100 },
    { x: 20, y: 20, pressure: 0.6, t: 200 },
  ],
  color: '#123456',
  width: 5,
  opacity: 1,
  duration: 200,
  createdAt: 1_100,
}

describe('board document events', () => {
  it('applies add, update, delete, and clear events immutably', () => {
    const added = applyItemEvent([], {
      id: 'event-1',
      type: 'add',
      at: 1_000,
      item: note,
    })
    expect(added).toEqual([note])

    const updatedNote = { ...note, text: 'A stronger thought' }
    const updated = applyItemEvent(added, {
      id: 'event-2',
      type: 'update',
      at: 1_200,
      item: updatedNote,
    })
    expect(updated[0]).toEqual(updatedNote)
    expect(added[0]).toEqual(note)

    const deleted = applyItemEvent(updated, {
      id: 'event-3',
      type: 'delete',
      at: 1_300,
      itemId: note.id,
    })
    expect(deleted).toEqual([])
    expect(
      applyItemEvent(added, { id: 'event-4', type: 'clear', at: 1_400 }),
    ).toEqual([])
  })

  it('reconstructs a pressure stroke progressively', () => {
    const timeline: TimelineEvent[] = [
      { id: 'event-1', type: 'add', at: 1_000, item: note },
      { id: 'event-2', type: 'add', at: 1_100, item: stroke },
    ]

    const partial = replayAt(timeline, 250)
    expect(partial.items).toHaveLength(2)
    expect(partial.items[1].type).toBe('stroke')
    expect((partial.items[1] as StrokeItem).points).toHaveLength(2)

    const complete = replayAt(timeline, 400)
    expect((complete.items[1] as StrokeItem).points).toHaveLength(3)
    expect(getReplayDuration(timeline)).toBe(1_200)
  })

  it('preserves camera events during replay', () => {
    const camera = { x: 42, y: -18, scale: 1.4 }
    const frame = replayAt(
      [{ id: 'camera-1', type: 'camera', at: 1_000, camera }],
      0,
    )
    expect(frame.camera).toEqual(camera)
  })

  it('starts a replay after the most recent clear event', () => {
    const timeline: TimelineEvent[] = [
      { id: 'event-1', type: 'add', at: 1_000, item: note },
      { id: 'clear-1', type: 'clear', at: 1_200 },
      { id: 'event-2', type: 'add', at: 1_300, item: note },
      { id: 'clear-2', type: 'clear', at: 1_400 },
      { id: 'event-3', type: 'add', at: 1_500, item: stroke },
    ]

    expect(getReplayTimelineSinceLastClear(timeline)).toEqual([timeline[4]])
  })

  it('keeps an idle replay moving without changing the source camera', () => {
    const camera = { x: 42, y: -18, scale: 1.4 }
    const viewport = { width: 1_200, height: 800 }
    const start = getAmbientReplayCamera(camera, 0, viewport)
    const later = getAmbientReplayCamera(camera, 4_000, viewport)

    expect(start.x).toBeCloseTo(camera.x)
    expect(start.y).toBeCloseTo(camera.y)
    expect(start.scale).toBeCloseTo(camera.scale)
    expect(later).not.toEqual(start)
    expect(camera).toEqual({ x: 42, y: -18, scale: 1.4 })
  })

  it('places transferred objects around a target with fresh identities', () => {
    const placed = placeItemsAtCenter([note, stroke], { x: 500, y: 400 }, 5_000)

    expect(placed).toHaveLength(2)
    expect(placed[0].id).not.toBe(note.id)
    expect(placed[1].id).not.toBe(stroke.id)
    expect(placed.map((item) => item.createdAt)).toEqual([5_000, 5_001])
    expect(placed[0]).not.toEqual(note)
    expect(note.x).toBe(20)
    expect(stroke.points[0]).toEqual({ x: 0, y: 0, pressure: 0.5, t: 0 })
  })

  it('normalizes persistent spatial transforms to usable limits', () => {
    const transformed = withSpatialTransform(note, {
      depth: 900,
      rotationX: -90,
      rotationY: 24,
      scale: 0.1,
    })

    expect(getSpatialTransform(transformed)).toEqual({
      depth: 500,
      rotationX: -70,
      rotationY: 24,
      rotationZ: 0,
      scale: 0.4,
    })
    expect(note.spatial).toBeUndefined()
  })
})

describe('project validation', () => {
  it('recognizes exported documents and rejects malformed input', () => {
    expect(isBoardDocument(createBoard())).toBe(true)
    expect(isBoardDocument({ version: 1, items: [] })).toBe(false)
    expect(isBoardDocument(null)).toBe(false)
  })
})

describe('swappable branding', () => {
  it('provides complete Canvas and ink tokens for every theme', () => {
    for (const theme of Object.values(BRAND_THEMES)) {
      expect(theme.inkColors).toHaveLength(6)
      expect(theme.canvas.background).toMatch(/^#/)
      expect(theme.canvas.grid).toContain('rgba')
      expect(theme.productName).toBeTruthy()
    }
  })

  it('uses the Ethical Tech CoLab website identity as the default demo', () => {
    const theme = BRAND_THEMES['ethical-tech']
    expect(theme.inkColors[0]).toBe('#c8f04b')
    expect(theme.canvas.background).toBe('#171020')
    expect(theme.logoSrc).toBe('./etc-logo.png')
  })
})
