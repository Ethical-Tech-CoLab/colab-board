import { describe, expect, it } from 'vitest'
import { createBoard, createNote } from './board'
import {
  applyLiveBoardPatch,
  applyLiveBoardPatches,
  createLiveBoardPatch,
  isLiveBoardPatch,
  LIVE_SESSION_PROTOCOL,
} from './liveProtocol'
import type {
  BoardDocument,
  ImageItem,
  NoteItem,
  TimelineEvent,
} from './types'

function withNote(
  board: BoardDocument,
  note: NoteItem,
  eventId = `event-${note.id}`,
): BoardDocument {
  const event: TimelineEvent = {
    id: eventId,
    type: 'add',
    at: note.createdAt,
    item: note,
  }
  return {
    ...board,
    updatedAt: note.createdAt,
    items: [...board.items, note],
    timeline: [...board.timeline, event],
  }
}

describe('live session operation protocol', () => {
  it('uses a versioned patch instead of retransmitting the complete board', () => {
    const board = createBoard()
    const note = createNote(20, 30)
    const next = withNote(board, note)
    const patch = createLiveBoardPatch(board, next, 'patch-1', 200)

    expect(LIVE_SESSION_PROTOCOL).toBe('ethical-tech-colab-live-v2')
    expect(patch).toMatchObject({
      id: 'patch-1',
      sentAt: 200,
      upserts: [note],
      deletes: [],
    })
    expect(patch?.reset).toBeUndefined()
    expect(isLiveBoardPatch(patch)).toBe(true)
    expect('item' in patch!.timeline[0]).toBe(false)
    expect(isLiveBoardPatch(JSON.parse(JSON.stringify(patch)))).toBe(true)
    expect(applyLiveBoardPatch(board, patch!)).toEqual(next)
  })

  it('merges concurrent changes to different objects in host order', () => {
    const board = createBoard()
    const first = createNote(20, 30)
    const second = createNote(300, 180)
    const firstBoard = withNote(board, first, 'event-first')
    const secondBoard = withNote(board, second, 'event-second')
    const firstPatch = createLiveBoardPatch(
      board,
      firstBoard,
      'patch-first',
      100,
    )
    const secondPatch = createLiveBoardPatch(
      board,
      secondBoard,
      'patch-second',
      101,
    )

    const merged = applyLiveBoardPatches(board, [firstPatch!, secondPatch!])
    expect(merged.items.map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ])
    expect(merged.timeline.map((event) => event.id)).toEqual([
      'event-first',
      'event-second',
    ])
  })

  it('resolves same-object conflicts deterministically without dropping peers', () => {
    const board = createBoard()
    const note = createNote(20, 30)
    const startingBoard = withNote(board, note)
    const firstBoard = {
      ...startingBoard,
      updatedAt: 200,
      items: [{ ...note, text: 'Austin' }],
    }
    const secondBoard = {
      ...startingBoard,
      updatedAt: 201,
      items: [{ ...note, text: 'New York' }],
    }
    const firstPatch = createLiveBoardPatch(
      startingBoard,
      firstBoard,
      'patch-austin',
      200,
    )
    const secondPatch = createLiveBoardPatch(
      startingBoard,
      secondBoard,
      'patch-new-york',
      201,
    )

    const merged = applyLiveBoardPatches(startingBoard, [
      firstPatch!,
      secondPatch!,
    ])
    expect((merged.items[0] as NoteItem).text).toBe('New York')
    expect(merged.timeline.at(-1)?.id).toContain('patch-new-york')
  })

  it('makes replayed patches idempotent for reconnect recovery', () => {
    const board = createBoard()
    const next = withNote(board, createNote(10, 10))
    const patch = createLiveBoardPatch(board, next, 'retry-safe', 200)!
    const once = applyLiveBoardPatch(board, patch)
    const twice = applyLiveBoardPatch(once, patch)

    expect(twice.items).toHaveLength(1)
    expect(twice.timeline).toHaveLength(1)
  })

  it('converts a local undo into a durable inverse operation', () => {
    const board = createBoard()
    const note = createNote(10, 10)
    const withAddedNote = withNote(board, note)
    const undone = {
      ...withAddedNote,
      updatedAt: withAddedNote.updatedAt + 1,
      items: [],
      timeline: [],
    }
    const patch = createLiveBoardPatch(
      withAddedNote,
      undone,
      'undo-note',
      undone.updatedAt,
    )!
    const synchronized = applyLiveBoardPatch(withAddedNote, patch)

    expect(patch.deletes).toEqual([note.id])
    expect(patch.timeline).toContainEqual(
      expect.objectContaining({ type: 'delete', itemId: note.id }),
    )
    expect(synchronized.items).toEqual([])
    expect(synchronized.timeline.at(-1)).toEqual(
      expect.objectContaining({ type: 'delete', itemId: note.id }),
    )
  })

  it('treats a serialized acknowledgement as content-equivalent', () => {
    const board = createBoard()
    const next = withNote(board, createNote(40, 50))
    const acknowledged = JSON.parse(JSON.stringify(next)) as BoardDocument

    expect(
      createLiveBoardPatch(next, acknowledged, 'ack-comparison', 400),
    ).toBeNull()
  })

  it('uses a full checkpoint only when the board identity changes', () => {
    const board = createBoard()
    const imported = { ...createBoard(), title: 'Imported workshop' }
    const patch = createLiveBoardPatch(board, imported, 'reset', 300)

    expect(patch?.reset).toBe(imported)
    expect(applyLiveBoardPatch(board, patch!)).toBe(imported)
  })

  it('keeps a normal update tiny even when the board contains embedded media', () => {
    const board = createBoard()
    const image: ImageItem = {
      id: 'image-large',
      type: 'image',
      x: 0,
      y: 0,
      width: 480,
      height: 320,
      src: `data:image/png;base64,${'A'.repeat(250_000)}`,
      name: 'reference.png',
      createdAt: 1,
    }
    const note = { ...createNote(20, 30), id: 'note-small' }
    const populated = {
      ...board,
      items: [image, note],
      timeline: [
        {
          id: 'event-image',
          type: 'add' as const,
          at: 1,
          item: image,
        },
        {
          id: 'event-note',
          type: 'add' as const,
          at: 2,
          item: note,
        },
      ],
    }
    const updatedNote = { ...note, text: 'Fast update' }
    const updated = {
      ...populated,
      updatedAt: 3,
      items: [image, updatedNote],
      timeline: [
        ...populated.timeline,
        {
          id: 'event-update',
          type: 'update' as const,
          at: 3,
          item: updatedNote,
        },
      ],
    }
    const patch = createLiveBoardPatch(
      populated,
      updated,
      'small-change',
      3,
    )!

    expect(JSON.stringify(patch).length).toBeLessThan(
      JSON.stringify(updated).length * 0.01,
    )
    expect(patch.upserts).toEqual([updatedNote])
  })

  it('rejects malformed patches', () => {
    expect(
      isLiveBoardPatch({
        id: 'bad',
        sentAt: 1,
        updatedAt: 1,
        metadata: {},
        upserts: [{ type: 'note' }],
        deletes: [],
        timeline: [],
      }),
    ).toBe(false)
  })
})
