import { describe, expect, it } from 'vitest'
import { createBoard } from './board'
import {
  createLiveSnapshotMessage,
  isLiveSnapshotMessage,
  LIVE_SESSION_PROTOCOL,
} from './liveSession'

describe('live session protocol', () => {
  it('creates a versioned board snapshot', () => {
    const board = createBoard()
    const message = createLiveSnapshotMessage(board, 200)

    expect(message).toMatchObject({
      protocol: LIVE_SESSION_PROTOCOL,
      type: 'snapshot',
      sentAt: 200,
      board,
    })
    expect(isLiveSnapshotMessage(message)).toBe(true)
  })

  it('rejects malformed and mismatched snapshots', () => {
    const board = createBoard()
    expect(
      isLiveSnapshotMessage({
        ...createLiveSnapshotMessage(board),
        protocol: 'future-protocol',
      }),
    ).toBe(false)
    expect(
      isLiveSnapshotMessage({
        protocol: LIVE_SESSION_PROTOCOL,
        type: 'snapshot',
        id: 'message',
        sentAt: 200,
        board: { title: 'Incomplete' },
      }),
    ).toBe(false)
  })
})
