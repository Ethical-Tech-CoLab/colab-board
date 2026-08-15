import { describe, expect, it } from 'vitest'
import {
  applyLiveDraftUpdate,
  coalesceLiveDraftUpdate,
  createLiveDraftTransition,
  isLiveDraftUpdate,
  type LiveDraftCursor,
  type LiveDraftUpdate,
} from './liveDraftProtocol'
import type { Point, StrokeItem } from './types'

function points(count: number): Point[] {
  return Array.from({ length: count }, (_, index) => ({
    x: index * 2,
    y: Math.sin(index / 4) * 20,
    pressure: 0.35 + (index % 5) * 0.1,
    t: index * 12,
  }))
}

function stroke(clientId: string, pointCount: number): StrokeItem {
  return {
    id: `stroke-${clientId}`,
    type: 'stroke',
    points: points(pointCount),
    color: '#72243e',
    width: 6,
    opacity: 1,
    duration: Math.max(0, (pointCount - 1) * 12),
    createdAt: 100,
  }
}

describe('live draft delta protocol', () => {
  it('reconstructs a cumulative local stroke from point deltas', () => {
    let cursor: LiveDraftCursor | null = null
    let remote: StrokeItem | undefined

    for (const pointCount of [1, 8, 20, 45]) {
      const transition = createLiveDraftTransition(
        cursor,
        stroke('a', pointCount),
        'a',
      )
      cursor = transition.cursor
      expect(transition.update).not.toBeNull()
      remote = applyLiveDraftUpdate(remote, transition.update!)
    }

    const expected = stroke('a', 45)
    expect({ ...remote, points: [] }).toEqual({ ...expected, points: [] })
    expect(remote?.points).toHaveLength(expected.points.length)
    remote?.points.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected.points[index].x, 1)
      expect(point.y).toBeCloseTo(expected.points[index].y, 1)
      expect(point.pressure).toBeCloseTo(expected.points[index].pressure, 2)
      expect(point.t).toBe(expected.points[index].t)
    })
    const ended = createLiveDraftTransition(cursor, null, 'a')
    expect(ended.update).toMatchObject({
      kind: 'end',
    })
    expect(applyLiveDraftUpdate(remote, ended.update!)).toBeUndefined()
  })

  it('omits optional undefined fields from PeerJS payloads', () => {
    const transition = createLiveDraftTransition(
      null,
      {
        ...stroke('plain', 2),
        effect: undefined,
        seed: undefined,
      },
      'plain',
    )

    expect(transition.update?.kind).toBe('start')
    if (transition.update?.kind === 'start') {
      expect('effect' in transition.update.stroke).toBe(false)
      expect('seed' in transition.update.stroke).toBe(false)
    }
  })

  it('uses substantially less bandwidth than cumulative snapshots', () => {
    let cursor: LiveDraftCursor | null = null
    const updates: LiveDraftUpdate[] = []
    const cumulativeSnapshots: StrokeItem[] = []

    for (let pointCount = 1; pointCount <= 121; pointCount += 5) {
      const draft = stroke('artist', pointCount)
      cumulativeSnapshots.push(draft)
      const transition = createLiveDraftTransition(
        cursor,
        draft,
        'artist',
      )
      cursor = transition.cursor
      if (transition.update) updates.push(transition.update)
    }

    const cumulativeBytes = JSON.stringify(cumulativeSnapshots).length
    const deltaBytes = JSON.stringify(updates).length
    expect(deltaBytes).toBeLessThan(cumulativeBytes * 0.2)
  })

  it('coalesces every author into one update per fan-out tick', () => {
    const queued = new Map<string, LiveDraftUpdate>()

    for (let author = 0; author < 7; author += 1) {
      const clientId = `client-${author}`
      let cursor: LiveDraftCursor | null = null
      for (const pointCount of [1, 4, 9, 16]) {
        const transition = createLiveDraftTransition(
          cursor,
          stroke(clientId, pointCount),
          clientId,
        )
        cursor = transition.cursor
        if (transition.update) {
          queued.set(
            clientId,
            coalesceLiveDraftUpdate(
              queued.get(clientId),
              transition.update,
            ),
          )
        }
      }
    }

    expect(queued.size).toBe(7)
    queued.forEach((update) => {
      expect(update.kind).toBe('start')
      if (update.kind === 'start') expect(update.points).toHaveLength(16)
    })
  })

  it('replaces stale queued previews with an explicit cancellation', () => {
    const start = createLiveDraftTransition(
      null,
      stroke('a', 10),
      'a',
    )
    const cancel = createLiveDraftTransition(
      start.cursor,
      null,
      'a',
      'cancel',
    )
    const queued = coalesceLiveDraftUpdate(start.update!, cancel.update!)

    expect(queued).toEqual({
      kind: 'cancel',
      clientId: 'a',
    })
  })

  it('rejects malformed or empty point updates', () => {
    expect(
      isLiveDraftUpdate({
        kind: 'append',
        clientId: 'a',
        points: [],
      }),
    ).toBe(false)
    expect(
      isLiveDraftUpdate({
        kind: 'append',
        clientId: 'a',
        points: [{ x: Number.NaN, y: 1, pressure: 0.5, t: 1 }],
      }),
    ).toBe(false)
  })
})
