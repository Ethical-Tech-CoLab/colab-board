import { describe, expect, it } from 'vitest'
import { createBoard } from './board'
import {
  TRANSFER_PROTOCOL,
  createBoardTransferEnvelope,
  createImageTransferEnvelope,
  formatTransferCode,
  generateTransferCode,
  isValidTransferCode,
  normalizeTransferCode,
  transferCodeFromValue,
  validateBoardTransferEnvelope,
  validateTransferEnvelope,
} from './transfer'

describe('transfer codes', () => {
  it('creates readable, normalized, high-entropy codes', () => {
    const code = generateTransferCode()

    expect(code).toHaveLength(8)
    expect(isValidTransferCode(code)).toBe(true)
    expect(formatTransferCode(code)).toMatch(/^[A-Z0-9]{4} [A-Z0-9]{4}$/)
    expect(normalizeTransferCode(formatTransferCode(code))).toBe(code)
  })

  it('rejects incomplete or ambiguous codes', () => {
    expect(isValidTransferCode('ABC')).toBe(false)
    expect(isValidTransferCode('0000 1111')).toBe(false)
  })

  it('extracts codes from manual entry and transfer QR links', () => {
    expect(transferCodeFromValue('ABCD EFGH')).toBe('ABCDEFGH')
    expect(
      transferCodeFromValue('https://example.org/board/#send=ABCD2345'),
    ).toBe('ABCD2345')
    expect(transferCodeFromValue('https://example.org/#send=invalid')).toBeNull()
  })
})

describe('image transfer envelope', () => {
  it('wraps and validates image content in the shared protocol', () => {
    const image = {
      name: 'idea.png',
      type: 'image/png',
      src: 'data:image/png;base64,aGVsbG8=',
      width: 640,
      height: 480,
    }
    const envelope = createImageTransferEnvelope(image)

    expect(envelope.kind).toBe('image')
    expect(envelope.image).toEqual(image)
    expect(validateTransferEnvelope(envelope)).toBe(true)
    expect(validateBoardTransferEnvelope(envelope)).toBe(false)
    expect(
      validateTransferEnvelope({
        ...envelope,
        image: { ...image, src: 'https://example.org/image.png' },
      }),
    ).toBe(false)
  })
})

describe('board transfer envelope', () => {
  it('wraps a complete board in the versioned transfer protocol', () => {
    const board = createBoard()
    const envelope = createBoardTransferEnvelope(board, 1_000)

    expect(envelope.protocol).toBe(TRANSFER_PROTOCOL)
    expect(envelope.board).toEqual(board)
    expect(envelope.expiresAt).toBeGreaterThan(envelope.createdAt)
    expect(validateBoardTransferEnvelope(envelope)).toBe(false)
  })

  it('accepts active envelopes and rejects malformed content', () => {
    const envelope = createBoardTransferEnvelope(createBoard())
    expect(validateBoardTransferEnvelope(envelope)).toBe(true)
    expect(
      validateBoardTransferEnvelope({
        ...envelope,
        board: { title: 'not a board' },
      }),
    ).toBe(false)
  })
})
