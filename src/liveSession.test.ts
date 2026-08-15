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

    expect(LIVE_SESSION_PROTOCOL).toBe('ethical-tech-colab-live-v3')
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

describe('late-join catch-up', () => {
  // scenario 1: host makes several notes before first participant joins
  it('checkpoint carries all host edits made before first participant joins', () => {
    // Host accumulates five edits before anyone connects.
    // The host's boardState is the running apply of every published patch.
    // When a participant joins, sendCheckpoint ships boardState directly.
    let hostBoard = createBoard()
    const startingBoard = hostBoard
    const notes = Array.from({ length: 5 }, (_, i) =>
      createNote(i * 50, i * 30),
    )
    const patches = notes.map((note, i) => {
      const next = withNote(hostBoard, note, `event-${i}`)
      const patch = createLiveBoardPatch(hostBoard, next, `patch-${i}`, i + 1)!
      hostBoard = next
      return patch
    })

    // boardState on the host is the cumulative result of all patches.
    const boardState = patches.reduce(
      (acc, patch) => applyLiveBoardPatch(acc, patch),
      startingBoard,
    )
    expect(boardState.items).toHaveLength(5)
    expect(boardState.items.map((n) => n.id)).toEqual(notes.map((n) => n.id))

    // A late-joining client sets confirmedBoard = checkpoint = boardState.
    // With no pending patches, localBoard = applyLiveBoardPatches(boardState, []) = boardState.
    const clientBoard = applyLiveBoardPatches(boardState, [])
    expect(clientBoard.items).toHaveLength(5)
    expect(clientBoard).toEqual(hostBoard)
  })

  // scenario 2: host and existing participant edit before second participant joins
  it('second late joiner receives merged board from host and first participant', () => {
    const initialBoard = createBoard()

    // Host adds note A.
    const noteA = createNote(10, 10)
    const hostBoard = withNote(initialBoard, noteA, 'event-a')

    // Participant 1 adds note B (concurrent, from the same base as host edit after merge).
    // In the protocol, the host's boardState accumulates both.
    const noteB = createNote(200, 200)
    const patchA = createLiveBoardPatch(initialBoard, hostBoard, 'patch-a', 1)!
    const afterA = applyLiveBoardPatch(initialBoard, patchA)
    const participant1Board = withNote(afterA, noteB, 'event-b')
    const patchB = createLiveBoardPatch(afterA, participant1Board, 'patch-b', 2)!

    // Host's boardState has both notes after applying both patches in order.
    const mergedBoardState = applyLiveBoardPatch(
      applyLiveBoardPatch(initialBoard, patchA),
      patchB,
    )
    expect(mergedBoardState.items).toHaveLength(2)
    expect(mergedBoardState.items.map((n) => n.id)).toEqual([
      noteA.id,
      noteB.id,
    ])

    // Second late-joining participant receives checkpoint = mergedBoardState.
    const secondClientBoard = applyLiveBoardPatches(mergedBoardState, [])
    expect(secondClientBoard.items).toHaveLength(2)
    expect(secondClientBoard).toEqual(mergedBoardState)
  })

  // scenario 3: an edit occurs while the new participant is receiving the checkpoint
  it('commit arriving after checkpoint is applied incrementally on top of checkpoint board', () => {
    // Host state before checkpoint.
    const base = createBoard()
    const noteA = createNote(10, 10)
    const checkpointBoard = withNote(base, noteA, 'event-a')

    // Client receives checkpoint; confirmedBoard = checkpointBoard.
    let confirmedBoard = checkpointBoard

    // While the checkpoint is in flight, host adds note B.
    const noteB = createNote(50, 50)
    const boardAfterB = withNote(checkpointBoard, noteB, 'event-b')
    const commitPatch = createLiveBoardPatch(
      checkpointBoard,
      boardAfterB,
      'commit-b',
      2,
    )!

    // Client receives the commit and applies it on top of confirmedBoard.
    confirmedBoard = applyLiveBoardPatch(confirmedBoard, commitPatch)
    // localBoard = applyLiveBoardPatches(confirmedBoard, pending=[]) = confirmedBoard
    const localBoard = applyLiveBoardPatches(confirmedBoard, [])

    expect(localBoard.items).toHaveLength(2)
    expect(localBoard).toEqual(boardAfterB)
  })

  // scenario 4: reconnect after falling behind — resync issues a new checkpoint
  it('resync checkpoint after a revision gap restores the client to current host state', () => {
    const base = createBoard()

    // Build host state through revisions 1–5.
    let hostBoardState = base
    for (let i = 0; i < 5; i++) {
      const note = createNote(i * 40, i * 40)
      const next = withNote(hostBoardState, note, `event-${i}`)
      const patch = createLiveBoardPatch(
        hostBoardState,
        next,
        `patch-${i}`,
        i + 1,
      )!
      hostBoardState = applyLiveBoardPatch(hostBoardState, patch)
    }

    // Client only has revision 2 (fell behind by 3 revisions).
    // Host detects the gap and sends a resync checkpoint at revision 5.
    const resyncCheckpointBoard = hostBoardState

    // Client applies resync: confirmedBoard = resyncCheckpointBoard.
    // Pending patches whose sequence > acknowledgedSequence are preserved but
    // here we assume client had no pending edits.
    const clientLocalBoard = applyLiveBoardPatches(resyncCheckpointBoard, [])
    expect(clientLocalBoard.items).toHaveLength(5)
    expect(clientLocalBoard).toEqual(hostBoardState)
  })

  // scenario 5: board with embedded image — checkpoint carries the full image once,
  // subsequent incremental patches remain tiny
  it('incremental patch after an image-bearing checkpoint omits the image bytes', () => {
    const base = createBoard()
    const image: ImageItem = {
      id: 'img-1',
      type: 'image',
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      src: `data:image/png;base64,${'B'.repeat(300_000)}`,
      name: 'board-bg.png',
      createdAt: 1,
    }
    // Checkpoint board already has the image.
    const checkpointBoard: BoardDocument = {
      ...base,
      updatedAt: 1,
      items: [image],
      timeline: [{ id: 'ev-img', type: 'add', at: 1, item: image }],
    }

    // After checkpoint, client adds a small note.
    const note = createNote(10, 10)
    const boardWithNote = withNote(checkpointBoard, note, 'ev-note')
    const incrementalPatch = createLiveBoardPatch(
      checkpointBoard,
      boardWithNote,
      'patch-note',
      2,
    )!

    // The incremental patch must NOT include the large image bytes.
    const patchJson = JSON.stringify(incrementalPatch)
    expect(patchJson).not.toContain('data:image/png')
    expect(patchJson.length).toBeLessThan(1_000)

    // Applying the patch on top of the checkpoint-received board gives the correct state.
    const clientBoard = applyLiveBoardPatch(checkpointBoard, incrementalPatch)
    expect(clientBoard.items).toHaveLength(2)
    expect(clientBoard).toEqual(boardWithNote)
  })

  // scenario 6: self-acknowledgements return null patches so onDocument is not
  // triggered and the participant's local undo stack is preserved
  it('self-acknowledgement produces a null patch leaving undo history intact', () => {
    const board = createBoard()
    const note = createNote(10, 20)
    const localBoard = withNote(board, note)

    // The acknowledged board arrives as a JSON round-trip (serialised over the wire).
    // confirmedBoard + applyLiveBoardPatches(confirmedBoard, pending) == localBoard
    // when all pending patches have been acknowledged.
    const confirmedBoard = JSON.parse(
      JSON.stringify(localBoard),
    ) as BoardDocument
    const nextBoard = applyLiveBoardPatches(confirmedBoard, [])

    // createLiveBoardPatch returns null when local and next are content-equivalent,
    // causing updateLocalFromConfirmed to skip options.onDocument (notifyDocument &&
    // (changed || forceNotify) === false) so the React undo stack is NOT cleared.
    const changed = createLiveBoardPatch(
      localBoard,
      nextBoard,
      'self-ack-check',
      500,
    )
    expect(changed).toBeNull()
  })
})
