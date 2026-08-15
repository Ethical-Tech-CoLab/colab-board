import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAMERA,
  applyItemEvent,
  boardPointToTextureUV,
  createBoard,
  fitImage,
  fitBoardCamera,
  getAmbientReplayCamera,
  getImageOpacity,
  getItemBounds,
  getItemsCenter,
  getReplayDuration,
  getReplayFade,
  getReplayTimelineSinceLastClear,
  getSpatialTransform,
  isBoardDocument,
  placeItemsAtCenter,
  replayAt,
  sparkleHue,
  sparkleOffset,
  sparkleTrailHue,
  texturePlaneCoords,
  withImageEdit,
  withSpatialTransform,
} from './board'
import {
  BRAND_THEMES,
  contrastRatio,
  createCustomBrandTheme,
  isThemeItConfig,
  parseThemePack,
  serializeThemePack,
  type ThemeItConfig,
} from './branding'
import type { ImageItem, NoteItem, StrokeItem, TimelineEvent } from './types'

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

  it('produces identical output when called with a pre-sorted timeline', () => {
    const timeline: TimelineEvent[] = [
      { id: 'event-2', type: 'add', at: 1_100, item: stroke },
      { id: 'event-1', type: 'add', at: 1_000, item: note },
    ]
    const sorted = [...timeline].sort((a, b) => a.at - b.at)

    const unsortedResult = replayAt(timeline, 300)
    const presortedResult = replayAt(sorted, 300, DEFAULT_CAMERA, true)

    expect(presortedResult.items).toHaveLength(unsortedResult.items.length)
    expect(presortedResult.camera).toEqual(unsortedResult.camera)
  })

  it('handles ghost-trail offsets with a pre-sorted timeline correctly', () => {
    const timeline: TimelineEvent[] = [
      { id: 'event-1', type: 'add', at: 1_000, item: note },
      { id: 'event-2', type: 'add', at: 1_100, item: stroke },
    ]
    const sorted = [...timeline].sort((a, b) => a.at - b.at)
    const sourceDuration = getReplayDuration(sorted)

    const primary = replayAt(
      sorted,
      sourceDuration * 0.5,
      DEFAULT_CAMERA,
      true,
    )
    const ghostOffset = sourceDuration * 0.025
    const ghost = replayAt(
      sorted,
      Math.max(0, sourceDuration * 0.5 - ghostOffset),
      DEFAULT_CAMERA,
      true,
    )

    expect(ghost.items.length).toBeLessThanOrEqual(primary.items.length)
  })

  it('uses initialCamera as the starting viewport when the screensaver begins', () => {
    const activationCamera = { x: 120, y: -60, scale: 2 }
    const timeline: TimelineEvent[] = [
      { id: 'event-1', type: 'add', at: 1_000, item: note },
      { id: 'event-2', type: 'add', at: 1_200, item: stroke },
    ]
    const frame = replayAt(timeline, 0, activationCamera)
    expect(frame.camera).toEqual(activationCamera)
  })

  it('overrides initialCamera once a recorded camera event is reached', () => {
    const activationCamera = { x: 120, y: -60, scale: 2 }
    const recordedCamera = { x: 300, y: 100, scale: 1.5 }
    const timeline: TimelineEvent[] = [
      { id: 'event-1', type: 'add', at: 1_000, item: note },
      { id: 'camera-1', type: 'camera', at: 1_100, camera: recordedCamera },
    ]
    const frame = replayAt(timeline, 200, activationCamera)
    expect(frame.camera).toEqual(recordedCamera)
  })

  it('returns initialCamera for an empty timeline', () => {
    const activationCamera = { x: 50, y: 80, scale: 1.2 }
    const frame = replayAt([], 0, activationCamera)
    expect(frame.camera).toEqual(activationCamera)
    expect(frame.items).toEqual([])
  })

  it('returns DEFAULT_CAMERA when no initialCamera and timeline is empty', () => {
    const frame = replayAt([], 0)
    expect(frame.camera).toEqual({ x: 0, y: 0, scale: 1 })
  })

  it('uses initialCamera after a post-clear replay with no subsequent camera event', () => {
    const activationCamera = { x: -200, y: 50, scale: 0.8 }
    const postClearTimeline = getReplayTimelineSinceLastClear([
      { id: 'event-1', type: 'add', at: 1_000, item: note },
      { id: 'clear-1', type: 'clear', at: 1_200 },
      { id: 'event-2', type: 'add', at: 1_400, item: stroke },
    ])
    const frame = replayAt(postClearTimeline, 0, activationCamera)
    expect(frame.camera).toEqual(activationCamera)
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

  it('fades a completed replay smoothly to the canvas background', () => {
    expect(getReplayFade(5_000, 6_000, 1_200)).toBe(1)
    expect(getReplayFade(6_600, 6_000, 1_200)).toBeCloseTo(0.5)
    expect(getReplayFade(7_200, 6_000, 1_200)).toBe(0)
    expect(getReplayFade(8_000, 6_000, 1_200)).toBe(0)
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

  it('finds the visual center of mixed board items', () => {
    expect(getItemsCenter([note, stroke])).toEqual({
      x: 128.75,
      y: 101.75,
    })
    expect(getItemsCenter([], { x: 12, y: 34 })).toEqual({ x: 12, y: 34 })
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

  it('generates deterministic sparkle colors and offsets', () => {
    expect(sparkleHue(42, 7)).toBe(sparkleHue(42, 7))
    expect(sparkleHue(42, 7)).not.toBe(sparkleHue(42, 8))
    expect(sparkleOffset(42, 7)).toBe(sparkleOffset(42, 7))
    expect(sparkleOffset(42, 7)).toBeGreaterThanOrEqual(-1)
    expect(sparkleOffset(42, 7)).toBeLessThanOrEqual(1)
    expect(sparkleTrailHue(42, 120)).toBe(sparkleTrailHue(42, 120))
    expect(sparkleTrailHue(42, 120)).not.toBe(sparkleTrailHue(42, 121))
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

  it('derives a complete contrast-aware custom theme', () => {
    const config: ThemeItConfig = {
      name: 'Night Shift',
      organization: 'Local team',
      primary: '#77ddbb',
      secondary: '#7655ee',
      canvas: '#101522',
      surface: '#1a2030',
    }
    const theme = createCustomBrandTheme(config)

    expect(theme.id).toBe('custom')
    expect(theme.inkColors).toHaveLength(6)
    expect(theme.canvas.grid).toMatch(/^rgba\(/)
    expect(theme.css?.['--brand-foreground']).toBe('#ffffff')
    expect(theme.colorScheme).toBe('dark')
    expect(contrastRatio('#25312b', theme.noteColor)).toBeGreaterThanOrEqual(4.5)
  })

  it('round-trips valid Theme-It packs and rejects malformed themes', () => {
    const config: ThemeItConfig = {
      name: 'Workshop',
      organization: 'Local team',
      primary: '#224466',
      secondary: '#dd8844',
      canvas: '#f4f5f6',
      surface: '#ffffff',
    }

    expect(parseThemePack(serializeThemePack(config))).toEqual(config)
    expect(isThemeItConfig({ ...config, primary: 'blue' })).toBe(false)
    expect(() => parseThemePack('{"kind":"colab-theme"}')).toThrow(
      'not a valid CoLab Board theme pack',
    )
  })
})

const testImage: ImageItem = {
  id: 'image-1',
  type: 'image',
  x: 100,
  y: 200,
  width: 320,
  height: 240,
  src: 'data:image/png;base64,abc',
  name: 'test.png',
  opacity: 1,
  createdAt: 2_000,
}

describe('image editing helpers', () => {
  it('getImageOpacity clamps and normalises values', () => {
    expect(getImageOpacity(testImage)).toBe(1)
    expect(getImageOpacity({ ...testImage, opacity: 0.5 })).toBe(0.5)
    expect(getImageOpacity({ ...testImage, opacity: undefined })).toBe(1)
    expect(getImageOpacity({ ...testImage, opacity: -0.1 })).toBe(0)
    expect(getImageOpacity({ ...testImage, opacity: 1.5 })).toBe(1)
    expect(getImageOpacity({ ...testImage, opacity: Number.NaN })).toBe(1)
  })

  it('withImageEdit updates opacity immutably', () => {
    const edited = withImageEdit(testImage, { opacity: 0.4 })
    expect(edited.opacity).toBeCloseTo(0.4)
    expect(testImage.opacity).toBe(1)
  })

  it('withImageEdit clamps out-of-range opacity', () => {
    expect(withImageEdit(testImage, { opacity: 2 }).opacity).toBe(1)
    expect(withImageEdit(testImage, { opacity: -1 }).opacity).toBe(0)
  })

  it('withImageEdit updates size preserving other fields', () => {
    const edited = withImageEdit(testImage, { width: 480, height: 360, x: 80, y: 160 })
    expect(edited.width).toBe(480)
    expect(edited.height).toBe(360)
    expect(edited.x).toBe(80)
    expect(edited.opacity).toBe(1)
    expect(edited.src).toBe(testImage.src)
  })

  it('fitImage returns opacity 1 and respects min/max size', () => {
    const fitted = fitImage('data:image/png;base64,x', 'img.png', 800, 600, { x: 0, y: 0 })
    expect(fitted.opacity).toBe(1)
    expect(fitted.width).toBeLessThanOrEqual(480)
    expect(fitted.height).toBeLessThanOrEqual(480)

    const small = fitImage('data:image/png;base64,x', 'img.png', 10, 10, { x: 0, y: 0 })
    expect(small.width).toBeGreaterThanOrEqual(10)
    expect(small.height).toBeGreaterThanOrEqual(10)
  })

  it('drag seeded from inspector preview preserves opacity and size after repositioning', () => {
    // Simulate: user adjusts opacity and width via the inspector, then immediately
    // drags the same image before the React re-render has settled.  The drag must
    // seed its base item from the inspector preview, not from the stale document
    // state, so the final committed item carries all three changes.

    const original = fitImage('data:image/png;base64,x', 'photo.png', 400, 300, {
      x: 100,
      y: 80,
    })
    const aspectRatio = original.width / original.height

    // Inspector commit: opacity → 0.35, width scaled to 240 (aspect-ratio locked)
    const inspectorNewWidth = 240
    const inspectorNewHeight = Math.round(inspectorNewWidth / aspectRatio)
    const cx = original.x + original.width / 2
    const cy = original.y + original.height / 2
    const inspectorEdit = withImageEdit(original, {
      opacity: 0.35,
      width: inspectorNewWidth,
      height: inspectorNewHeight,
      x: cx - inspectorNewWidth / 2,
      y: cy - inspectorNewHeight / 2,
    })

    expect(inspectorEdit.opacity).toBeCloseTo(0.35)
    expect(inspectorEdit.width).toBe(inspectorNewWidth)

    // Drag seeds from the inspector preview item and moves +120 / +60
    const dx = 120
    const dy = 60
    const afterDrag = {
      ...inspectorEdit,
      x: inspectorEdit.x + dx,
      y: inspectorEdit.y + dy,
    }

    // All inspector-set properties must survive the position change
    expect(afterDrag.opacity).toBeCloseTo(0.35)
    expect(afterDrag.width).toBe(inspectorNewWidth)
    expect(afterDrag.height).toBe(inspectorNewHeight)
    expect(afterDrag.x).toBe(inspectorEdit.x + dx)
    expect(afterDrag.y).toBe(inspectorEdit.y + dy)
    // Source data unchanged
    expect(afterDrag.src).toBe(original.src)
    expect(afterDrag.id).toBe(original.id)
  })
})

describe('water screensaver coordinate helpers', () => {
  it('returns DEFAULT_CAMERA when the board has no items', () => {
    expect(fitBoardCamera([], 1024, 1024)).toEqual(DEFAULT_CAMERA)
  })

  it('fits all item bounds within the texture viewport with padding', () => {
    const cam = fitBoardCamera([note, stroke], 1024, 1024, 40)
    for (const item of [note, stroke]) {
      const b = getItemBounds(item)
      expect(cam.x + b.x * cam.scale).toBeGreaterThanOrEqual(0)
      expect(cam.x + (b.x + b.width) * cam.scale).toBeLessThanOrEqual(1024)
      expect(cam.y + b.y * cam.scale).toBeGreaterThanOrEqual(0)
      expect(cam.y + (b.y + b.height) * cam.scale).toBeLessThanOrEqual(1024)
    }
  })

  it('maps a single-item centroid to the centre of texture and plane', () => {
    // With only one item the fit camera centres its bounding box exactly in
    // the texture, so the centroid UV should be 0.5 and the plane coord 0.
    const cam = fitBoardCamera([note], 1024, 1024)
    const cx = note.x + note.width / 2
    const cy = note.y + note.height / 2
    const { u, v } = boardPointToTextureUV(cx, cy, cam, 1024, 1024)
    const { x, y } = texturePlaneCoords(u, v)
    expect(u).toBeCloseTo(0.5)
    expect(v).toBeCloseTo(0.5)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
  })

  it('clamps out-of-range UV to the [-1, 1] plane boundary', () => {
    expect(texturePlaneCoords(-0.5, 1.5)).toEqual({ x: -1, y: -1 })
    expect(texturePlaneCoords(0, 0)).toEqual({ x: -1, y: 1 })
    expect(texturePlaneCoords(1, 1)).toEqual({ x: 1, y: -1 })
  })

  it('preserves the coordinate-space relationship across the pipeline', () => {
    // A point at the top-right of the board content should map to the
    // top-right quadrant of the plane (positive x, positive y).
    const cam = fitBoardCamera([note, stroke], 1024, 1024)
    const allBounds = [note, stroke].map(getItemBounds)
    const right = Math.max(...allBounds.map((b) => b.x + b.width))
    const top = Math.min(...allBounds.map((b) => b.y)) // top = min y in canvas coords
    const { u, v } = boardPointToTextureUV(right, top, cam, 1024, 1024)
    const { x, y } = texturePlaneCoords(u, v)
    expect(x).toBeGreaterThan(0) // right side
    expect(y).toBeGreaterThan(0) // top (v small → y positive)
  })
})

describe('screensaver mode validation', () => {
  it('includes water in the valid screensaver modes', () => {
    const validModes = [
      'replay',
      'drift',
      'galaxy',
      'aurora',
      'constellation',
      'terminal',
      'snake',
      'water',
    ] as const
    const waterMode: import('./types').ScreensaverMode = 'water'
    expect(validModes).toContain(waterMode)
  })
})
