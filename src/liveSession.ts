import Peer, { type DataConnection, util } from 'peerjs'
import { isBoardDocument } from './board'
import {
  generateTransferCode,
  isValidTransferCode,
  normalizeTransferCode,
} from './transfer'
import type { BoardDocument } from './types'

export const LIVE_SESSION_PROTOCOL = 'ethical-tech-colab-live-v1'
const LIVE_PEER_PREFIX = 'etc-colab-live-'

export type LiveSessionRole = 'host' | 'join'
export type LiveSessionStatus =
  | 'starting'
  | 'ready'
  | 'connecting'
  | 'connected'
  | 'error'

export interface LiveSnapshotMessage {
  protocol: typeof LIVE_SESSION_PROTOCOL
  type: 'snapshot'
  id: string
  sentAt: number
  board: BoardDocument
}

export interface LiveSession {
  code: string
  role: LiveSessionRole
  publish: (board: BoardDocument) => void
  close: () => void
}

interface LiveSessionOptions {
  onStatus: (status: LiveSessionStatus) => void
  onDocument: (board: BoardDocument) => void
  onError: (error: Error) => void
}

function livePeerId(code: string): string {
  return `${LIVE_PEER_PREFIX}${normalizeTransferCode(code).toLowerCase()}`
}

function liveErrorType(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof error.type === 'string'
  ) {
    return error.type
  }
  return undefined
}

export function liveSessionErrorMessage(error: unknown): string {
  const type = liveErrorType(error)
  if (type === 'browser-incompatible') {
    return 'This browser cannot create a secure peer session.'
  }
  if (type === 'peer-unavailable') {
    return 'That live board is not available. Check the code and keep the host tab open.'
  }
  if (type === 'unavailable-id') {
    return 'That live code is already in use. Start a new hosted session.'
  }
  if (
    type === 'network' ||
    type === 'server-error' ||
    type === 'socket-error' ||
    type === 'socket-closed' ||
    type === 'disconnected'
  ) {
    return 'The live signaling service could not be reached. Check internet access and try again.'
  }
  if (
    type === 'webrtc' ||
    type === 'negotiation-failed' ||
    type === 'connection-closed'
  ) {
    return 'The devices found each other, but the network blocked the live WebRTC connection.'
  }
  if (error instanceof Error && error.message) return error.message
  return 'The live board session could not connect.'
}

export function createLiveSnapshotMessage(
  board: BoardDocument,
  now = Date.now(),
): LiveSnapshotMessage {
  return {
    protocol: LIVE_SESSION_PROTOCOL,
    type: 'snapshot',
    id: crypto.randomUUID(),
    sentAt: now,
    board,
  }
}

export function isLiveSnapshotMessage(
  value: unknown,
): value is LiveSnapshotMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LiveSnapshotMessage>
  return (
    candidate.protocol === LIVE_SESSION_PROTOCOL &&
    candidate.type === 'snapshot' &&
    typeof candidate.id === 'string' &&
    typeof candidate.sentAt === 'number' &&
    isBoardDocument(candidate.board)
  )
}

export function supportsLiveSessions(): boolean {
  return util.supports.data
}

function boardFingerprint(board: BoardDocument): string {
  return JSON.stringify(board)
}

function sendSnapshot(
  connection: DataConnection,
  message: LiveSnapshotMessage,
) {
  if (connection.open) connection.send(message)
}

export function hostLiveSession(
  board: BoardDocument,
  options: LiveSessionOptions,
): LiveSession {
  if (!supportsLiveSessions()) {
    throw new Error('This browser does not support live peer sessions.')
  }

  const code = generateTransferCode()
  const peer = new Peer(livePeerId(code), { debug: 1 })
  const connections = new Set<DataConnection>()
  let closed = false
  let latestMessage = createLiveSnapshotMessage(board)
  let latestFingerprint = boardFingerprint(board)

  const fail = (error: unknown) => {
    if (closed) return
    options.onStatus('error')
    options.onError(new Error(liveSessionErrorMessage(error)))
  }

  const close = () => {
    if (closed) return
    closed = true
    connections.forEach((connection) => connection.close())
    connections.clear()
    peer.destroy()
  }

  peer.on('open', () => options.onStatus('ready'))
  peer.on('connection', (connection) => {
    const metadata = connection.metadata as { protocol?: unknown } | undefined
    if (metadata?.protocol !== LIVE_SESSION_PROTOCOL) {
      connection.close()
      console.warn('Rejected a connection using an unsupported live protocol.')
      return
    }

    options.onStatus('connecting')
    connections.add(connection)
    connection.on('open', () => {
      sendSnapshot(connection, latestMessage)
      options.onStatus('connected')
    })
    connection.on('data', (data: unknown) => {
      if (!isLiveSnapshotMessage(data)) {
        fail(new Error('A peer sent malformed live board data.'))
        return
      }
      const fingerprint = boardFingerprint(data.board)
      if (fingerprint === latestFingerprint) return
      latestMessage = data
      latestFingerprint = fingerprint
      options.onDocument(data.board)
      connections.forEach((other) => {
        if (other !== connection) sendSnapshot(other, data)
      })
    })
    connection.on('error', fail)
    connection.on('close', () => {
      connections.delete(connection)
      if (!closed) {
        options.onStatus(connections.size > 0 ? 'connected' : 'ready')
      }
    })
  })
  peer.on('error', fail)
  peer.on('disconnected', () => {
    if (closed || peer.destroyed || !peer.disconnected) return
    try {
      peer.reconnect()
    } catch (error: unknown) {
      fail(error)
    }
  })

  return {
    code,
    role: 'host',
    publish(nextBoard) {
      const fingerprint = boardFingerprint(nextBoard)
      if (fingerprint === latestFingerprint) return
      latestMessage = createLiveSnapshotMessage(nextBoard)
      latestFingerprint = fingerprint
      connections.forEach((connection) =>
        sendSnapshot(connection, latestMessage),
      )
    },
    close,
  }
}

export function joinLiveSession(
  requestedCode: string,
  options: LiveSessionOptions,
): LiveSession {
  if (!supportsLiveSessions()) {
    throw new Error('This browser does not support live peer sessions.')
  }

  const code = normalizeTransferCode(requestedCode)
  if (!isValidTransferCode(code)) {
    throw new Error('Enter all 8 characters from the host board.')
  }

  const peer = new Peer({ debug: 1 })
  let connection: DataConnection | undefined
  let closed = false
  let latestFingerprint = ''

  const fail = (error: unknown) => {
    if (closed) return
    options.onStatus('error')
    options.onError(new Error(liveSessionErrorMessage(error)))
  }

  const close = () => {
    if (closed) return
    closed = true
    connection?.close()
    peer.destroy()
  }

  peer.on('open', () => {
    options.onStatus('connecting')
    connection = peer.connect(livePeerId(code), {
      reliable: true,
      metadata: { protocol: LIVE_SESSION_PROTOCOL },
    })
    connection.on('open', () => options.onStatus('connected'))
    connection.on('data', (data: unknown) => {
      if (!isLiveSnapshotMessage(data)) {
        fail(new Error('The host sent malformed live board data.'))
        return
      }
      const fingerprint = boardFingerprint(data.board)
      if (fingerprint === latestFingerprint) return
      latestFingerprint = fingerprint
      options.onDocument(data.board)
    })
    connection.on('error', fail)
    connection.on('close', () => {
      if (!closed) fail({ type: 'connection-closed' })
    })
  })
  peer.on('error', fail)
  peer.on('disconnected', () => {
    if (closed || peer.destroyed || !peer.disconnected) return
    try {
      peer.reconnect()
    } catch (error: unknown) {
      fail(error)
    }
  })

  return {
    code,
    role: 'join',
    publish(nextBoard) {
      const fingerprint = boardFingerprint(nextBoard)
      if (!connection?.open || fingerprint === latestFingerprint) return
      latestFingerprint = fingerprint
      sendSnapshot(connection, createLiveSnapshotMessage(nextBoard))
    },
    close,
  }
}
