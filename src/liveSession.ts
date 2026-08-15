import Peer, { type DataConnection, util } from 'peerjs'
import { isBoardDocument } from './board'
import {
  applyLiveDraftUpdate,
  coalesceLiveDraftUpdate,
  createLiveDraftTransition,
  isLiveDraftUpdate,
  withLiveDraftClientId,
  type LiveDraftCursor,
  type LiveDraftEndReason,
  type LiveDraftUpdate,
} from './liveDraftProtocol'
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
const COMMIT_INTERVAL_MS = 16
const DRAFT_BUFFER_LIMIT_BYTES = 128 * 1_024
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
  publishDraft: (
    draft: StrokeItem | null,
    reason?: LiveDraftEndReason,
  ) => void
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

interface LiveCommit {
  revision: number
  clientId: string
  sequence: number
  patch: LiveBoardPatch
}

interface LiveCommitsMessage {
  protocol: typeof LIVE_SESSION_PROTOCOL
  type: 'commits'
  commits: LiveCommit[]
}

interface LiveResyncMessage {
  protocol: typeof LIVE_SESSION_PROTOCOL
  type: 'resync'
  clientId: string
  revision: number
}

interface LiveDraftsMessage {
  protocol: typeof LIVE_SESSION_PROTOCOL
  type: 'drafts'
  updates: LiveDraftUpdate[]
}

type LiveClientMessage =
  | LiveSubmitMessage
  | LiveResyncMessage
  | LiveDraftsMessage
type LiveHostMessage =
  | LiveCheckpointMessage
  | LiveCommitsMessage
  | LiveDraftsMessage

interface PendingPatch {
  sequence: number
  patch: LiveBoardPatch
}

function livePeerId(code: string): string {
  return `${LIVE_PEER_PREFIX}${normalizeTransferCode(code).toLowerCase()}`
}

function createLiveClientId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12)
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
  if (value.type === 'drafts') {
    const message = value as Partial<LiveDraftsMessage>
    return (
      Array.isArray(message.updates) &&
      message.updates.length > 0 &&
      message.updates.every(isLiveDraftUpdate)
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
  if (value.type === 'drafts') {
    const message = value as Partial<LiveDraftsMessage>
    return (
      Array.isArray(message.updates) &&
      message.updates.length > 0 &&
      message.updates.every(isLiveDraftUpdate)
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
  if (value.type === 'commits') {
    const message = value as Partial<LiveCommitsMessage>
    return (
      Array.isArray(message.commits) &&
      message.commits.length > 0 &&
      message.commits.every((commit: unknown) => {
        if (!commit || typeof commit !== 'object') return false
        const candidate = commit as Partial<LiveCommit>
        return (
          isInteger(candidate.revision) &&
          typeof candidate.clientId === 'string' &&
          isInteger(candidate.sequence) &&
          isLiveBoardPatch(candidate.patch)
        )
      })
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

interface DraftQueue {
  enqueue: (update: LiveDraftUpdate) => void
  close: () => void
}

function createDraftQueue(
  connection: DataConnection,
  onError: (error: unknown) => void,
  immediateStarts = false,
): DraftQueue {
  const queued = new Map<string, LiveDraftUpdate>()
  let timer: number | undefined

  const schedule = () => {
    if (timer === undefined) {
      timer = window.setTimeout(flush, DRAFT_INTERVAL_MS)
    }
  }

  const flush = () => {
    timer = undefined
    if (queued.size === 0 || !connection.open) return
    if (connection.dataChannel.bufferedAmount > DRAFT_BUFFER_LIMIT_BYTES) {
      schedule()
      return
    }
    const message: LiveDraftsMessage = {
      protocol: LIVE_SESSION_PROTOCOL,
      type: 'drafts',
      updates: [...queued.values()],
    }
    if (sendMessage(connection, message, onError)) queued.clear()
    if (queued.size > 0) schedule()
  }

  return {
    enqueue(update) {
      queued.set(
        update.clientId,
        coalesceLiveDraftUpdate(queued.get(update.clientId), update),
      )
      if (immediateStarts && update.kind === 'start') flush()
      else schedule()
    },
    close() {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
      queued.clear()
    },
  }
}

interface CommitQueue {
  enqueue: (commit: LiveCommit) => void
  close: () => void
}

function createCommitQueue(
  connection: DataConnection,
  onError: (error: unknown) => void,
): CommitQueue {
  let queued: LiveCommit[] = []
  let timer: number | undefined

  const flush = () => {
    timer = undefined
    if (queued.length === 0 || !connection.open) return
    const commits = queued
    const message: LiveCommitsMessage = {
      protocol: LIVE_SESSION_PROTOCOL,
      type: 'commits',
      commits,
    }
    if (sendMessage(connection, message, onError)) queued = []
    if (queued.length > 0) {
      timer = window.setTimeout(flush, COMMIT_INTERVAL_MS)
    }
  }

  return {
    enqueue(commit) {
      queued.push(commit)
      if (timer === undefined) {
        timer = window.setTimeout(flush, COMMIT_INTERVAL_MS)
      }
    },
    close() {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
      queued = []
    },
  }
}

function createDraftPublisher(
  clientId: string,
  send: (update: LiveDraftUpdate) => void,
): {
  publish: (draft: StrokeItem | null, reason?: LiveDraftEndReason) => void
  reset: () => void
} {
  let cursor: LiveDraftCursor | null = null
  return {
    publish(draft, reason) {
      const transition = createLiveDraftTransition(
        cursor,
        draft,
        clientId,
        reason,
      )
      cursor = transition.cursor
      if (transition.update) send(transition.update)
    },
    reset() {
      cursor = null
    },
  }
}

function applyDraftUpdates(
  drafts: Map<string, StrokeItem>,
  updates: LiveDraftUpdate[],
  onDraft: LiveSessionOptions['onDraft'],
) {
  const changed = new Set<string>()
  for (const update of updates) {
    const current = drafts.get(update.clientId)
    const next = applyLiveDraftUpdate(current, update)
    if (next === current) continue
    changed.add(update.clientId)
    if (next) drafts.set(update.clientId, next)
    else drafts.delete(update.clientId)
  }
  changed.forEach((clientId) => onDraft?.(clientId, drafts.get(clientId) ?? null))
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
  const hostId = createLiveClientId()
  const peer = new Peer(livePeerId(code), { debug: 1 })
  const connections = new Map<
    DataConnection,
    {
      clientId: string
      stopDiagnostics: () => void
      drafts: DraftQueue
      commits: CommitQueue
    }
  >()
  const acknowledgedSequences = new Map<string, number>()
  const remoteDrafts = new Map<string, StrokeItem>()
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
    const commit: LiveCommit = {
      revision,
      clientId,
      sequence,
      patch,
    }
    connections.forEach(({ commits }) => commits.enqueue(commit))
  }

  const broadcastDrafts = (
    updates: LiveDraftUpdate[],
    except?: DataConnection,
  ) => {
    connections.forEach(({ drafts }, connection) => {
      if (connection === except) return
      updates.forEach((update) => drafts.enqueue(update))
    })
  }
  const finishCommittedDraft = (
    clientId: string,
    patch: LiveBoardPatch,
    except?: DataConnection,
  ) => {
    const draft = remoteDrafts.get(clientId)
    if (!draft || !patch.upserts.some((item) => item.id === draft.id)) return
    const update: LiveDraftUpdate = {
      kind: 'end',
      clientId,
    }
    applyDraftUpdates(remoteDrafts, [update], options.onDraft)
    broadcastDrafts([update], except)
  }
  const draftPublisher = createDraftPublisher(hostId, (update) =>
    broadcastDrafts([update]),
  )

  const close = () => {
    if (closed) return
    closed = true
    connections.forEach(({ stopDiagnostics, drafts, commits }, connection) => {
      stopDiagnostics()
      drafts.close()
      commits.close()
      connection.close()
    })
    connections.clear()
    draftPublisher.reset()
    remoteDrafts.clear()
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
      const onSendError = (error: unknown) => {
        console.warn(
          'A live board peer send failed; closing that connection.',
          error,
        )
        connection.close()
      }
      connections.set(connection, {
        clientId,
        stopDiagnostics,
        drafts: createDraftQueue(connection, onSendError),
        commits: createCommitQueue(connection, onSendError),
      })
      sendCheckpoint(connection, clientId)
      options.onStatus('connected')
    })
    connection.on('data', (data: unknown) => {
      if (!isLiveClientMessage(data)) {
        console.warn('Rejected malformed live board data from a peer.')
        connection.close()
        return
      }
      if (data.type === 'drafts') {
        const updates = data.updates.map((update) =>
          withLiveDraftClientId(update, clientId),
        )
        applyDraftUpdates(remoteDrafts, updates, options.onDraft)
        broadcastDrafts(updates, connection)
        return
      }
      if (data.clientId !== clientId) {
        console.warn('Rejected live board data with the wrong client identity.')
        connection.close()
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
      finishCommittedDraft(clientId, data.patch, connection)
      broadcastCommit(clientId, data.sequence, data.patch)
      options.onDocument(boardState)
    })
    connection.on('error', (error) => {
      console.warn('A live board peer connection reported an error.', error)
    })
    connection.on('close', () => {
      const state = connections.get(connection)
      state?.stopDiagnostics()
      state?.drafts.close()
      state?.commits.close()
      connections.delete(connection)
      const draft = remoteDrafts.get(clientId)
      if (draft) {
        const update: LiveDraftUpdate = {
          kind: 'cancel',
          clientId,
        }
        applyDraftUpdates(remoteDrafts, [update], options.onDraft)
        broadcastDrafts([update])
      }
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
    publishDraft(draft, reason) {
      draftPublisher.publish(draft, reason)
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

  const clientId = createLiveClientId()
  const peer = new Peer({ debug: 1 })
  let connection: DataConnection | undefined
  let closed = false
  let ready = false
  let everConnected = false
  let reconnectAttempt = 0
  let reconnectTimer: number | undefined
  let stopDiagnostics: () => void = () => undefined
  let draftQueue: DraftQueue | undefined
  let revision = 0
  let nextSequence = 1
  let acknowledgedSequence = 0
  let sentThroughSequence = 0
  let confirmedBoard: BoardDocument | undefined
  let localBoard = initialBoard
  let pending: PendingPatch[] = []
  let lastSyncedAt: number | null = null
  let diagnostics = EMPTY_LIVE_DIAGNOSTICS
  const remoteDrafts = new Map<string, StrokeItem>()

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
    remoteDrafts.forEach((_, id) => options.onDraft?.(id, null))
    remoteDrafts.clear()
  }

  const updateLocalFromConfirmed = (
    notifyDocument = true,
    forceNotify = false,
  ) => {
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
    if (notifyDocument && (changed || forceNotify)) options.onDocument(localBoard)
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
    draftQueue?.close()
    draftQueue = undefined
    draftPublisher.reset()
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
      draftQueue = createDraftQueue(
        nextConnection,
        (error) => {
          console.warn('A live ink preview could not be sent.', error)
        },
        true,
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
        updateLocalFromConfirmed(true, true)
        flushPending()
        return
      }

      if (data.type === 'drafts') {
        applyDraftUpdates(remoteDrafts, data.updates, options.onDraft)
        return
      }

      let expectedRevision = revision
      for (const commit of data.commits) {
        if (commit.revision <= expectedRevision) continue
        if (!confirmedBoard || commit.revision !== expectedRevision + 1) {
          ready = false
          sendResync()
          return
        }
        expectedRevision = commit.revision
      }

      let acceptedCommit = false
      let notifyDocument = false
      let pendingChanged = false
      for (const commit of data.commits) {
        if (commit.revision <= revision) {
          if (commit.clientId === clientId) {
            acknowledgedSequence = Math.max(
              acknowledgedSequence,
              commit.sequence,
            )
            pending = pending.filter(
              (entry) => entry.sequence > acknowledgedSequence,
            )
            pendingChanged = true
          }
          continue
        }

        revision = commit.revision
        const currentConfirmed = confirmedBoard
        if (!currentConfirmed) {
          ready = false
          sendResync()
          return
        }
        confirmedBoard = applyLiveBoardPatch(currentConfirmed, commit.patch)
        acceptedCommit = true
        notifyDocument ||= commit.clientId !== clientId
        if (commit.clientId === clientId) {
          acknowledgedSequence = Math.max(
            acknowledgedSequence,
            commit.sequence,
          )
          pending = pending.filter(
            (entry) => entry.sequence > acknowledgedSequence,
          )
          pendingChanged = true
        }
        const draft = remoteDrafts.get(commit.clientId)
        if (
          draft &&
          commit.patch.upserts.some((item) => item.id === draft.id)
        ) {
          applyDraftUpdates(
            remoteDrafts,
            [
              {
                kind: 'end',
                clientId: commit.clientId,
              },
            ],
            options.onDraft,
          )
        }
      }
      if (pendingChanged) reportPending()
      if (acceptedCommit) {
        lastSyncedAt = Date.now()
        updateLocalFromConfirmed(notifyDocument)
      } else if (pendingChanged) {
        updateLocalFromConfirmed(false)
      }
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
    draftQueue?.close()
    draftPublisher.reset()
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

  const draftPublisher = createDraftPublisher(clientId, (update) => {
    if (!ready || !connection?.open) return
    draftQueue?.enqueue(update)
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
    publishDraft(draft, reason) {
      draftPublisher.publish(draft, reason)
    },
    close,
  }
}
