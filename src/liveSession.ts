import Peer, { type DataConnection, util } from 'peerjs'
import { isBoardDocument } from './board'
import {
  applyLiveBoardPatch,
  applyLiveBoardPatches,
  createLiveBoardPatch,
  isLiveBoardPatch,
  LIVE_SESSION_PROTOCOL,
  type LiveBoardPatch,
} from './liveProtocol'
import {
  generateTransferCode,
  isValidTransferCode,
  normalizeTransferCode,
} from './transfer'
import type { BoardDocument, StrokeItem } from './types'

export { LIVE_SESSION_PROTOCOL } from './liveProtocol'

const LIVE_PEER_PREFIX = 'etc-colab-live-'
const DIAGNOSTIC_INTERVAL_MS = 5_000
const DRAFT_INTERVAL_MS = 50
const RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 5_000]

export type LiveSessionRole = 'host' | 'join'
export type LiveSessionStatus =
  | 'starting'
  | 'ready'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
export type LiveConnectionRoute = 'direct' | 'relay' | 'unknown'

export interface LiveSessionDiagnostics {
  route: LiveConnectionRoute
  roundTripMs: number | null
  pendingChanges: number
  lastSyncedAt: number | null
}

export const EMPTY_LIVE_DIAGNOSTICS: LiveSessionDiagnostics = {
  route: 'unknown',
  roundTripMs: null,
  pendingChanges: 0,
  lastSyncedAt: null,
}

export interface LiveSession {
  code: string
  role: LiveSessionRole
  publish: (board: BoardDocument) => void
  publishDraft: (draft: StrokeItem | null) => void
  close: () => void
}

interface LiveSessionOptions {
  onStatus: (status: LiveSessionStatus) => void
  onDocument: (board: BoardDocument) => void
  onError: (error: Error) => void
  onDiagnostics?: (diagnostics: LiveSessionDiagnostics) => void
  onDraft?: (clientId: string, draft: StrokeItem | null) => void
}

interface LiveCheckpointMessage {
  protocol: typeof LIVE_SESSION_PROTOCOL
  type: 'checkpoint'
  revision: number
  acknowledgedSequence: number
  board: BoardDocument
}

interface LiveSubmitMessage {
  protocol: typeof LIVE_SESSION_PROTOCOL
  type: 'submit'
  clientId: string
  sequence: number
  patch: LiveBoardPatch
}

interface LiveCommitMessage {
  protocol: typeof LIVE_SESSION_PROTOCOL
  type: 'commit'
  revision: number
  clientId: string
  sequence: number
  patch: LiveBoardPatch
}

interface LiveResyncMessage {
  protocol: typeof LIVE_SESSION_PROTOCOL
  type: 'resync'
  clientId: string
  revision: number
}

interface LiveDraftMessage {
  protocol: typeof LIVE_SESSION_PROTOCOL
  type: 'draft'
  clientId: string
  draft: StrokeItem | null
}

type LiveClientMessage =
  | LiveSubmitMessage
  | LiveResyncMessage
  | LiveDraftMessage
type LiveHostMessage =
  | LiveCheckpointMessage
  | LiveCommitMessage
  | LiveDraftMessage

interface PendingPatch {
  sequence: number
  patch: LiveBoardPatch
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

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isStrokeItem(value: unknown): value is StrokeItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<StrokeItem>
  return (
    item.type === 'stroke' &&
    typeof item.id === 'string' &&
    typeof item.createdAt === 'number' &&
    Array.isArray(item.points) &&
    item.points.every(
      (point) =>
        typeof point.x === 'number' &&
        typeof point.y === 'number' &&
        typeof point.pressure === 'number' &&
        typeof point.t === 'number',
    ) &&
    typeof item.color === 'string' &&
    typeof item.width === 'number' &&
    typeof item.opacity === 'number' &&
    typeof item.duration === 'number'
  )
}

function hasProtocol(value: unknown): value is {
  protocol: typeof LIVE_SESSION_PROTOCOL
  type: unknown
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'protocol' in value &&
    value.protocol === LIVE_SESSION_PROTOCOL &&
    'type' in value
  )
}

function isLiveClientMessage(value: unknown): value is LiveClientMessage {
  if (!hasProtocol(value)) return false
  if (value.type === 'draft') {
    const message = value as Partial<LiveDraftMessage>
    return (
      typeof message.clientId === 'string' &&
      (message.draft === null || isStrokeItem(message.draft))
    )
  }
  if (value.type === 'resync') {
    const message = value as Partial<LiveResyncMessage>
    return (
      typeof message.clientId === 'string' && isInteger(message.revision)
    )
  }
  if (value.type === 'submit') {
    const message = value as Partial<LiveSubmitMessage>
    return (
      typeof message.clientId === 'string' &&
      isInteger(message.sequence) &&
      isLiveBoardPatch(message.patch)
    )
  }
  return false
}

function isLiveHostMessage(value: unknown): value is LiveHostMessage {
  if (!hasProtocol(value)) return false
  if (value.type === 'draft') {
    const message = value as Partial<LiveDraftMessage>
    return (
      typeof message.clientId === 'string' &&
      (message.draft === null || isStrokeItem(message.draft))
    )
  }
  if (value.type === 'checkpoint') {
    const message = value as Partial<LiveCheckpointMessage>
    return (
      isInteger(message.revision) &&
      isInteger(message.acknowledgedSequence) &&
      isBoardDocument(message.board)
    )
  }
  if (value.type === 'commit') {
    const message = value as Partial<LiveCommitMessage>
    return (
      isInteger(message.revision) &&
      typeof message.clientId === 'string' &&
      isInteger(message.sequence) &&
      isLiveBoardPatch(message.patch)
    )
  }
  return false
}

export function supportsLiveSessions(): boolean {
  return util.supports.data
}

function sendMessage(
  connection: DataConnection,
  message: LiveClientMessage | LiveHostMessage,
  onError: (error: unknown) => void,
): boolean {
  if (!connection.open) return false
  try {
    const result = connection.send(message)
    if (result instanceof Promise) result.catch(onError)
    return true
  } catch (error: unknown) {
    onError(error)
    return false
  }
}

function createDraftPublisher(
  clientId: string,
  send: (message: LiveDraftMessage) => void,
): { publish: (draft: StrokeItem | null) => void; close: () => void } {
  let queued: StrokeItem | null | undefined
  let timer: number | undefined

  const flush = () => {
    timer = undefined
    if (queued === undefined) return
    const draft = queued
    queued = undefined
    send({
      protocol: LIVE_SESSION_PROTOCOL,
      type: 'draft',
      clientId,
      draft,
    })
  }

  return {
    publish(draft) {
      queued = draft
      if (timer === undefined) {
        timer = window.setTimeout(flush, DRAFT_INTERVAL_MS)
      }
    },
    close() {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
      queued = undefined
    },
  }
}

async function inspectConnection(
  connection: DataConnection,
): Promise<Pick<LiveSessionDiagnostics, 'route' | 'roundTripMs'>> {
  const stats = await connection.peerConnection.getStats()
  const reports = new Map<string, Record<string, unknown>>()
  stats.forEach((report) => {
    reports.set(report.id, report as unknown as Record<string, unknown>)
  })

  const transport = [...reports.values()].find(
    (report) =>
      report.type === 'transport' &&
      typeof report.selectedCandidatePairId === 'string',
  )
  const selectedPairId = transport?.selectedCandidatePairId
  const pair =
    (typeof selectedPairId === 'string'
      ? reports.get(selectedPairId)
      : undefined) ??
    [...reports.values()].find(
      (report) =>
        report.type === 'candidate-pair' &&
        report.state === 'succeeded' &&
        report.nominated === true,
    )
  if (!pair) return { route: 'unknown', roundTripMs: null }

  const local =
    typeof pair.localCandidateId === 'string'
      ? reports.get(pair.localCandidateId)
      : undefined
  const remote =
    typeof pair.remoteCandidateId === 'string'
      ? reports.get(pair.remoteCandidateId)
      : undefined
  const route =
    local?.candidateType === 'relay' || remote?.candidateType === 'relay'
      ? 'relay'
      : local || remote
        ? 'direct'
        : 'unknown'
  const roundTripMs =
    typeof pair.currentRoundTripTime === 'number'
      ? Math.round(pair.currentRoundTripTime * 1_000)
      : null
  return { route, roundTripMs }
}

function startDiagnostics(
  connection: DataConnection,
  getPendingChanges: () => number,
  getLastSyncedAt: () => number | null,
  onDiagnostics: LiveSessionOptions['onDiagnostics'],
): () => void {
  if (!onDiagnostics) return () => undefined
  let stopped = false
  let transport: Pick<LiveSessionDiagnostics, 'route' | 'roundTripMs'> = {
    route: 'unknown',
    roundTripMs: null,
  }
  const report = async () => {
    try {
      transport = await inspectConnection(connection)
    } catch (error: unknown) {
      console.warn('Live connection diagnostics were unavailable.', error)
    }
    if (!stopped) {
      onDiagnostics({
        ...transport,
        pendingChanges: getPendingChanges(),
        lastSyncedAt: getLastSyncedAt(),
      })
    }
  }
  void report()
  const timer = window.setInterval(report, DIAGNOSTIC_INTERVAL_MS)
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}

export function hostLiveSession(
  board: BoardDocument,
  options: LiveSessionOptions,
): LiveSession {
  if (!supportsLiveSessions()) {
    throw new Error('This browser does not support live peer sessions.')
  }

  const code = generateTransferCode()
  const hostId = crypto.randomUUID()
  const peer = new Peer(livePeerId(code), { debug: 1 })
  const connections = new Map<
    DataConnection,
    { clientId: string; stopDiagnostics: () => void }
  >()
  const acknowledgedSequences = new Map<string, number>()
  let closed = false
  let boardState = board
  let localBoard = board
  let revision = 0
  let hostSequence = 0
  let lastSyncedAt: number | null = null

  const fail = (error: unknown) => {
    if (closed) return
    options.onStatus('error')
    options.onError(new Error(liveSessionErrorMessage(error)))
  }

  const sendToPeer = (
    connection: DataConnection,
    message: LiveHostMessage,
  ) =>
    sendMessage(connection, message, (error) => {
      console.warn('A live board peer send failed; closing that connection.', error)
      connection.close()
    })

  const sendCheckpoint = (
    connection: DataConnection,
    clientId: string,
  ) => {
    sendToPeer(
      connection,
      {
        protocol: LIVE_SESSION_PROTOCOL,
        type: 'checkpoint',
        revision,
        acknowledgedSequence:
          acknowledgedSequences.get(clientId) ?? 0,
        board: boardState,
      },
    )
  }

  const broadcastCommit = (
    clientId: string,
    sequence: number,
    patch: LiveBoardPatch,
  ) => {
    const message: LiveCommitMessage = {
      protocol: LIVE_SESSION_PROTOCOL,
      type: 'commit',
      revision,
      clientId,
      sequence,
      patch,
    }
    connections.forEach((_, connection) => sendToPeer(connection, message))
  }

  const broadcastDraft = (
    message: LiveDraftMessage,
    except?: DataConnection,
  ) => {
    connections.forEach((_, connection) => {
      if (connection !== except) sendToPeer(connection, message)
    })
  }
  const draftPublisher = createDraftPublisher(hostId, (message) =>
    broadcastDraft(message),
  )

  const close = () => {
    if (closed) return
    closed = true
    connections.forEach(({ stopDiagnostics }, connection) => {
      stopDiagnostics()
      connection.close()
    })
    connections.clear()
    draftPublisher.close()
    peer.destroy()
  }

  peer.on('open', () => options.onStatus('ready'))
  peer.on('connection', (connection) => {
    const metadata = connection.metadata as
      | { protocol?: unknown; clientId?: unknown }
      | undefined
    if (
      metadata?.protocol !== LIVE_SESSION_PROTOCOL ||
      typeof metadata.clientId !== 'string'
    ) {
      connection.close()
      console.warn('Rejected a connection using an unsupported live protocol.')
      return
    }

    const clientId = metadata.clientId
    options.onStatus(connections.size > 0 ? 'connected' : 'connecting')
    connection.on('open', () => {
      const stopDiagnostics = startDiagnostics(
        connection,
        () => 0,
        () => lastSyncedAt,
        options.onDiagnostics,
      )
      connections.set(connection, { clientId, stopDiagnostics })
      sendCheckpoint(connection, clientId)
      options.onStatus('connected')
    })
    connection.on('data', (data: unknown) => {
      if (!isLiveClientMessage(data) || data.clientId !== clientId) {
        console.warn('Rejected malformed live board data from a peer.')
        connection.close()
        return
      }
      if (data.type === 'draft') {
        options.onDraft?.(clientId, data.draft)
        broadcastDraft(data, connection)
        return
      }
      if (data.type === 'resync') {
        sendCheckpoint(connection, clientId)
        return
      }

      const acknowledged = acknowledgedSequences.get(clientId) ?? 0
      if (data.sequence <= acknowledged) {
        sendCheckpoint(connection, clientId)
        return
      }
      if (data.sequence !== acknowledged + 1) {
        sendCheckpoint(connection, clientId)
        return
      }

      boardState = applyLiveBoardPatch(boardState, data.patch)
      localBoard = boardState
      revision += 1
      lastSyncedAt = Date.now()
      acknowledgedSequences.set(clientId, data.sequence)
      broadcastCommit(clientId, data.sequence, data.patch)
      options.onDocument(boardState)
    })
    connection.on('error', (error) => {
      console.warn('A live board peer connection reported an error.', error)
    })
    connection.on('close', () => {
      const state = connections.get(connection)
      state?.stopDiagnostics()
      connections.delete(connection)
      options.onDraft?.(clientId, null)
      broadcastDraft({
        protocol: LIVE_SESSION_PROTOCOL,
        type: 'draft',
        clientId,
        draft: null,
      })
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
      const patch = createLiveBoardPatch(localBoard, nextBoard)
      localBoard = nextBoard
      if (!patch) return
      boardState = applyLiveBoardPatch(boardState, patch)
      revision += 1
      hostSequence += 1
      lastSyncedAt = Date.now()
      broadcastCommit(hostId, hostSequence, patch)
    },
    publishDraft(draft) {
      draftPublisher.publish(draft)
    },
    close,
  }
}

export function joinLiveSession(
  requestedCode: string,
  initialBoard: BoardDocument,
  options: LiveSessionOptions,
): LiveSession {
  if (!supportsLiveSessions()) {
    throw new Error('This browser does not support live peer sessions.')
  }

  const code = normalizeTransferCode(requestedCode)
  if (!isValidTransferCode(code)) {
    throw new Error('Enter all 8 characters from the host board.')
  }

  const clientId = crypto.randomUUID()
  const peer = new Peer({ debug: 1 })
  let connection: DataConnection | undefined
  let closed = false
  let ready = false
  let everConnected = false
  let reconnectAttempt = 0
  let reconnectTimer: number | undefined
  let stopDiagnostics: () => void = () => undefined
  let revision = 0
  let nextSequence = 1
  let acknowledgedSequence = 0
  let sentThroughSequence = 0
  let confirmedBoard: BoardDocument | undefined
  let localBoard = initialBoard
  let pending: PendingPatch[] = []
  let lastSyncedAt: number | null = null
  let diagnostics = EMPTY_LIVE_DIAGNOSTICS
  const remoteDraftIds = new Set<string>()

  const updateDiagnostics = (next: LiveSessionDiagnostics) => {
    diagnostics = next
    options.onDiagnostics?.(next)
  }

  const reportPending = () => {
    updateDiagnostics({
      ...diagnostics,
      pendingChanges: pending.length,
      lastSyncedAt,
    })
  }

  const fail = (error: unknown) => {
    if (closed) return
    options.onStatus('error')
    options.onError(new Error(liveSessionErrorMessage(error)))
  }

  const retryAfterSendFailure = (error: unknown) => {
    console.warn('A live board send failed; reconnecting to recover.', error)
    connection?.close()
  }

  const sendResync = () => {
    if (!connection?.open) return
    sendMessage(
      connection,
      {
        protocol: LIVE_SESSION_PROTOCOL,
        type: 'resync',
        clientId,
        revision,
      },
      retryAfterSendFailure,
    )
  }

  const flushPending = () => {
    if (!ready || !connection?.open) return
    for (const entry of pending) {
      if (entry.sequence <= sentThroughSequence) continue
      const sent = sendMessage(
        connection,
        {
          protocol: LIVE_SESSION_PROTOCOL,
          type: 'submit',
          clientId,
          sequence: entry.sequence,
          patch: entry.patch,
        },
        retryAfterSendFailure,
      )
      if (!sent) break
      sentThroughSequence = entry.sequence
    }
  }

  const clearRemoteDrafts = () => {
    remoteDraftIds.forEach((id) => options.onDraft?.(id, null))
    remoteDraftIds.clear()
  }

  const updateLocalFromConfirmed = (notifyDocument = true) => {
    if (!confirmedBoard) return
    const nextBoard = applyLiveBoardPatches(
      confirmedBoard,
      pending.map((entry) => entry.patch),
    )
    const changed = createLiveBoardPatch(
      localBoard,
      nextBoard,
      'local-comparison',
      nextBoard.updatedAt,
    )
    localBoard = nextBoard
    if (notifyDocument && changed) options.onDocument(localBoard)
  }

  const clearReconnectTimer = () => {
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== undefined) return
    ready = false
    stopDiagnostics()
    options.onStatus(everConnected ? 'reconnecting' : 'connecting')
    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
      ]
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined
      connect()
    }, delay)
  }

  const connect = () => {
    if (closed) return
    if (!peer.open) {
      if (peer.disconnected && !peer.destroyed) {
        try {
          peer.reconnect()
        } catch (error: unknown) {
          fail(error)
        }
      }
      scheduleReconnect()
      return
    }
    if (connection?.open) return

    options.onStatus(everConnected ? 'reconnecting' : 'connecting')
    const nextConnection = peer.connect(livePeerId(code), {
      reliable: true,
      metadata: { protocol: LIVE_SESSION_PROTOCOL, clientId },
    })
    connection = nextConnection
    nextConnection.on('open', () => {
      if (connection !== nextConnection || closed) return
      sentThroughSequence = acknowledgedSequence
      stopDiagnostics = startDiagnostics(
        nextConnection,
        () => pending.length,
        () => lastSyncedAt,
        updateDiagnostics,
      )
    })
    nextConnection.on('data', (data: unknown) => {
      if (connection !== nextConnection || !isLiveHostMessage(data)) {
        if (connection === nextConnection) {
          fail(new Error('The host sent malformed live board data.'))
        }
        return
      }

      if (data.type === 'checkpoint') {
        clearRemoteDrafts()
        revision = data.revision
        acknowledgedSequence = Math.max(
          acknowledgedSequence,
          data.acknowledgedSequence,
        )
        pending = pending.filter(
          (entry) => entry.sequence > acknowledgedSequence,
        )
        reportPending()
        confirmedBoard = data.board
        sentThroughSequence = acknowledgedSequence
        lastSyncedAt = Date.now()
        ready = true
        everConnected = true
        reconnectAttempt = 0
        options.onStatus('connected')
        updateLocalFromConfirmed()
        flushPending()
        return
      }

      if (data.type === 'draft') {
        if (data.draft) remoteDraftIds.add(data.clientId)
        else remoteDraftIds.delete(data.clientId)
        options.onDraft?.(data.clientId, data.draft)
        return
      }

      if (data.revision <= revision) {
        if (data.clientId === clientId) {
          acknowledgedSequence = Math.max(
            acknowledgedSequence,
            data.sequence,
          )
          pending = pending.filter(
            (entry) => entry.sequence > acknowledgedSequence,
          )
          reportPending()
        }
        return
      }
      if (data.revision !== revision + 1 || !confirmedBoard) {
        ready = false
        sendResync()
        return
      }

      revision = data.revision
      confirmedBoard = applyLiveBoardPatch(confirmedBoard, data.patch)
      if (data.clientId === clientId) {
        acknowledgedSequence = Math.max(
          acknowledgedSequence,
          data.sequence,
        )
        pending = pending.filter(
          (entry) => entry.sequence > acknowledgedSequence,
        )
        reportPending()
      }
      lastSyncedAt = Date.now()
      updateLocalFromConfirmed(data.clientId !== clientId)
      flushPending()
    })
    nextConnection.on('error', (error) => {
      if (!everConnected) {
        fail(error)
      } else {
        console.warn('The live board connection will retry.', error)
      }
    })
    nextConnection.on('close', () => {
      if (connection !== nextConnection || closed) return
      connection = undefined
      sentThroughSequence = acknowledgedSequence
      clearRemoteDrafts()
      scheduleReconnect()
    })
  }

  const close = () => {
    if (closed) return
    closed = true
    clearReconnectTimer()
    stopDiagnostics()
    draftPublisher.close()
    clearRemoteDrafts()
    connection?.close()
    peer.destroy()
  }

  peer.on('open', connect)
  peer.on('error', (error) => {
    if (!everConnected || liveErrorType(error) === 'unavailable-id') {
      fail(error)
    } else {
      console.warn('The live peer will attempt to reconnect.', error)
      scheduleReconnect()
    }
  })
  peer.on('disconnected', scheduleReconnect)

  const draftPublisher = createDraftPublisher(clientId, (message) => {
    if (!ready || !connection?.open) return
    sendMessage(connection, message, (error) => {
      console.warn('A live ink preview could not be sent.', error)
    })
  })

  return {
    code,
    role: 'join',
    publish(nextBoard) {
      const patch = createLiveBoardPatch(localBoard, nextBoard)
      localBoard = nextBoard
      if (!patch) return
      pending.push({ sequence: nextSequence, patch })
      nextSequence += 1
      reportPending()
      flushPending()
    },
    publishDraft(draft) {
      draftPublisher.publish(draft)
    },
    close,
  }
}
