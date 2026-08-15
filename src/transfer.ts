import Peer, { type DataConnection, util } from 'peerjs'
import type { BoardDocument } from './types'
import { isBoardDocument } from './board'

export const TRANSFER_PROTOCOL = 'ethical-tech-colab-transfer-v1'
export const TRANSFER_TTL_MS = 10 * 60 * 1_000
export const RECEIVE_TIMEOUT_MS = 90_000
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const PEER_PREFIX = 'etc-colab-board-'

export type TransferStatus =
  | 'starting'
  | 'ready'
  | 'connecting'
  | 'sending'
  | 'received'
  | 'complete'
  | 'expired'
  | 'error'

interface TransferEnvelopeBase {
  protocol: typeof TRANSFER_PROTOCOL
  createdAt: number
  expiresAt: number
}

export interface BoardTransferEnvelope extends TransferEnvelopeBase {
  kind: 'board'
  board: BoardDocument
}

export interface TransferImage {
  name: string
  type: string
  src: string
  width: number
  height: number
}

export interface ImageTransferEnvelope extends TransferEnvelopeBase {
  kind: 'image'
  image: TransferImage
}

export type TransferEnvelope = BoardTransferEnvelope | ImageTransferEnvelope
export type TransferContent =
  | { kind: 'board'; board: BoardDocument }
  | { kind: 'image'; image: TransferImage }

export interface TransferSession {
  code: string
  link: string
  close: () => void
}

interface OutgoingOptions {
  code?: string
  intent?: 'take' | 'send'
  onStatus: (status: TransferStatus) => void
  onError: (error: Error) => void
}

interface IncomingOptions {
  onStatus: (status: TransferStatus) => void
  onContent: (content: TransferContent) => void
  onError: (error: Error) => void
}

function transferErrorType(error: unknown): string | undefined {
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

export function transferErrorMessage(
  error: unknown,
  direction: 'send' | 'receive',
): string {
  const type = transferErrorType(error)
  if (type === 'browser-incompatible') {
    return 'This browser cannot make a secure WebRTC transfer. Update it or download the project instead.'
  }
  if (
    type === 'network' ||
    type === 'server-error' ||
    type === 'socket-error' ||
    type === 'socket-closed' ||
    type === 'disconnected'
  ) {
    return 'The transfer service could not be reached. Check internet access, then retry with both pages open.'
  }
  if (type === 'peer-unavailable') {
    return 'The sending device is not available. Keep its QR card open and awake, then try again.'
  }
  if (
    type === 'webrtc' ||
    type === 'negotiation-failed' ||
    type === 'connection-closed'
  ) {
    return 'The devices found each other, but the network blocked the WebRTC connection. Disable a VPN or try another Wi-Fi or cellular network.'
  }
  if (type === 'unavailable-id') {
    return 'That transfer code is already in use. Create a new transfer and try again.'
  }
  if (error instanceof Error && error.message) return error.message
  return direction === 'send'
    ? 'The transfer could not be started.'
    : 'The devices could not connect. Keep both pages open and try again.'
}

function peerIdForCode(code: string): string {
  return `${PEER_PREFIX}${normalizeTransferCode(code).toLowerCase()}`
}

function isTransferImage(value: unknown): value is TransferImage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TransferImage>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.src === 'string' &&
    candidate.src.startsWith('data:image/') &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number'
  )
}

function parseEnvelope(value: unknown): TransferEnvelope {
  if (
    !value ||
    typeof value !== 'object' ||
    !('protocol' in value) ||
    value.protocol !== TRANSFER_PROTOCOL ||
    !('createdAt' in value) ||
    typeof value.createdAt !== 'number' ||
    !('expiresAt' in value) ||
    typeof value.expiresAt !== 'number' ||
    value.expiresAt <= value.createdAt
  ) {
    throw new Error('The transfer did not contain valid CoLab content.')
  }
  if (Date.now() > value.expiresAt) {
    throw new Error('This transfer has expired.')
  }
  if (
    'kind' in value &&
    value.kind === 'board' &&
    'board' in value &&
    isBoardDocument(value.board)
  ) {
    return value as BoardTransferEnvelope
  }
  if (
    'kind' in value &&
    value.kind === 'image' &&
    'image' in value &&
    isTransferImage(value.image)
  ) {
    return value as ImageTransferEnvelope
  }
  throw new Error('The transfer content is malformed or unsupported.')
}

async function decodeEnvelope(data: unknown): Promise<TransferEnvelope> {
  let text: string
  if (typeof data === 'string') {
    text = data
  } else if (data instanceof Blob) {
    text = await data.text()
  } else if (data instanceof ArrayBuffer) {
    text = new TextDecoder().decode(data)
  } else if (ArrayBuffer.isView(data)) {
    text = new TextDecoder().decode(data)
  } else {
    return parseEnvelope(data)
  }

  return parseEnvelope(JSON.parse(text) as unknown)
}

export function generateTransferCode(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return [...bytes]
    .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    .join('')
}

export function normalizeTransferCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatTransferCode(code: string): string {
  const normalized = normalizeTransferCode(code)
  return `${normalized.slice(0, 4)} ${normalized.slice(4, 8)}`.trim()
}

export function isValidTransferCode(code: string): boolean {
  const normalized = normalizeTransferCode(code)
  return (
    normalized.length === 8 &&
    [...normalized].every((character) => CODE_ALPHABET.includes(character))
  )
}

export function createTransferLink(
  code: string,
  intent: 'take' | 'send' = 'take',
): string {
  const url = new URL(import.meta.env.BASE_URL, window.location.href)
  url.hash = `${intent}=${normalizeTransferCode(code)}`
  return url.toString()
}

export function getTransferIntent(): {
  intent: 'take' | 'send'
  code: string
} | null {
  const parameters = new URLSearchParams(window.location.hash.slice(1))
  for (const intent of ['take', 'send'] as const) {
    const code = parameters.get(intent)
    if (code && isValidTransferCode(code)) {
      return { intent, code: normalizeTransferCode(code) }
    }
  }
  return null
}

export function clearTransferIntent() {
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}

/**
 * Pure helper: parses a URL hash string and returns a valid live-session code,
 * or null if the parameter is absent or invalid.  Testable without a browser.
 */
export function parseLiveSessionCode(hash: string): string | null {
  const parameters = new URLSearchParams(hash.slice(1))
  const code = parameters.get('session')
  return code && isValidTransferCode(code) ? normalizeTransferCode(code) : null
}

/**
 * Pure helper: builds a join URL from a base URL string, an existing hash
 * string, and a session code.  Testable without a browser.
 */
export function buildLiveSessionLink(
  base: string,
  currentHash: string,
  code: string,
): string {
  const url = new URL(base)
  const params = new URLSearchParams(currentHash.slice(1))
  params.set('session', normalizeTransferCode(code))
  url.hash = params.toString()
  return url.toString()
}

/**
 * Creates a shareable join URL that routes the recipient directly into the
 * live-session join flow with the given host code pre-filled.
 *
 * The code is embedded in the URL hash (`#session=CODE`) so it is never sent
 * to a server; it stays in the browser and is only shared peer-to-peer when
 * the recipient opens the link.
 */
export function createLiveSessionLink(code: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.href).toString()
  return buildLiveSessionLink(base, window.location.hash, code)
}

/**
 * Reads a live-session join code from the URL hash (`#session=CODE`), if
 * present and valid.  Returns null otherwise so the normal idle state is shown.
 */
export function getLiveSessionIntent(): string | null {
  return parseLiveSessionCode(window.location.hash)
}

/**
 * Removes the `session` parameter from the URL hash without touching other
 * hash parameters or the query string, preventing a reconnect loop on reload.
 */
export function clearLiveSessionIntent() {
  const parameters = new URLSearchParams(window.location.hash.slice(1))
  parameters.delete('session')
  const remaining = parameters.toString()
  history.replaceState(
    null,
    '',
    `${location.pathname}${location.search}${remaining ? `#${remaining}` : ''}`,
  )
}

export function createBoardTransferEnvelope(
  board: BoardDocument,
  now = Date.now(),
): BoardTransferEnvelope {
  return {
    protocol: TRANSFER_PROTOCOL,
    kind: 'board',
    createdAt: now,
    expiresAt: now + TRANSFER_TTL_MS,
    board,
  }
}

export function createImageTransferEnvelope(
  image: TransferImage,
  now = Date.now(),
): ImageTransferEnvelope {
  return {
    protocol: TRANSFER_PROTOCOL,
    kind: 'image',
    createdAt: now,
    expiresAt: now + TRANSFER_TTL_MS,
    image,
  }
}

export function supportsPeerTransfer(): boolean {
  return util.supports.data
}

export function startOutgoingTransfer(
  content: TransferContent,
  options: OutgoingOptions,
): TransferSession {
  if (!supportsPeerTransfer()) {
    throw new Error('This browser does not support device-to-device transfer.')
  }

  const code = normalizeTransferCode(options.code ?? generateTransferCode())
  const peer = new Peer(peerIdForCode(code), { debug: 1 })
  const expiresAt = Date.now() + TRANSFER_TTL_MS
  let delivered = false
  let failed = false
  let expiryTimer = 0

  const close = () => {
    window.clearTimeout(expiryTimer)
    peer.destroy()
  }
  const fail = (error: unknown) => {
    if (failed || delivered) return
    failed = true
    options.onStatus('error')
    options.onError(new Error(transferErrorMessage(error, 'send')))
    close()
  }

  options.onStatus('starting')
  peer.on('open', () => {
    options.onStatus('ready')
    expiryTimer = window.setTimeout(() => {
      options.onStatus('expired')
      close()
    }, Math.max(0, expiresAt - Date.now()))
  })
  peer.on('connection', (connection) => {
    if (delivered) {
      connection.close()
      return
    }
    options.onStatus('connecting')
    connection.on('error', fail)
    connection.on('open', () => {
      options.onStatus('sending')
      const envelope =
        content.kind === 'board'
          ? createBoardTransferEnvelope(content.board)
          : createImageTransferEnvelope(content.image)
      connection.send(
        new Blob([JSON.stringify(envelope)], { type: 'application/json' }),
      )
    })
    connection.on('data', (data) => {
      if (data === 'received') {
        delivered = true
        options.onStatus('complete')
        window.setTimeout(close, 750)
      }
    })
    connection.on('close', () => {
      if (!delivered && !failed) options.onStatus('ready')
    })
  })
  peer.on('error', fail)
  peer.on('disconnected', () => fail({ type: 'disconnected' }))

  return {
    code,
    link: createTransferLink(code, options.intent ?? 'take'),
    close,
  }
}

export function startOutgoingBoardTransfer(
  board: BoardDocument,
  options: OutgoingOptions,
): TransferSession {
  return startOutgoingTransfer({ kind: 'board', board }, options)
}

export function receiveTransfer(
  code: string,
  options: IncomingOptions,
): () => void {
  if (!supportsPeerTransfer()) {
    throw new Error('This browser does not support device-to-device transfer.')
  }
  if (!isValidTransferCode(code)) {
    throw new Error('Enter the complete 8-character transfer code.')
  }

  const peer = new Peer({ debug: 1 })
  let connection: DataConnection | undefined
  let timeout = 0
  let retryTimer = 0
  let finished = false
  let peerOpened = false
  const close = () => {
    window.clearTimeout(timeout)
    window.clearTimeout(retryTimer)
    connection?.close()
    peer.destroy()
  }
  const fail = (error: unknown) => {
    if (finished) return
    finished = true
    options.onStatus('error')
    options.onError(new Error(transferErrorMessage(error, 'receive')))
    close()
  }

  options.onStatus('starting')
  const connect = () => {
    if (finished || !peerOpened) return
    connection?.close()
    options.onStatus('connecting')
    connection = peer.connect(peerIdForCode(code), {
      reliable: true,
      serialization: 'binary',
    })
    connection.on('error', fail)
    connection.on('iceStateChanged', (state) => {
      if (state === 'failed') fail({ type: 'negotiation-failed' })
    })
    connection.on('open', () => options.onStatus('sending'))
    connection.on('data', (data) => {
      decodeEnvelope(data)
        .then((envelope) => {
          if (finished) return
          finished = true
          window.clearTimeout(timeout)
          window.clearTimeout(retryTimer)
          options.onContent(
            envelope.kind === 'board'
              ? { kind: 'board', board: envelope.board }
              : { kind: 'image', image: envelope.image },
          )
          options.onStatus('received')
          connection?.send('received')
          window.setTimeout(close, 750)
        })
        .catch(fail)
    })
  }
  peer.on('open', () => {
    peerOpened = true
    connect()
  })
  peer.on('error', (error) => {
    if (transferErrorType(error) === 'peer-unavailable' && !finished) {
      connection?.close()
      retryTimer = window.setTimeout(connect, 1_800)
      return
    }
    fail(error)
  })
  peer.on('disconnected', () => fail({ type: 'disconnected' }))
  timeout = window.setTimeout(
    () =>
      fail(
        new Error(
          'No connection after 90 seconds. Keep the source QR card open and awake, then retry. If a VPN or managed network blocks WebRTC, use another network or download the project.',
        ),
      ),
    RECEIVE_TIMEOUT_MS,
  )

  return close
}

export function receiveBoardTransfer(
  code: string,
  options: Omit<IncomingOptions, 'onContent'> & {
    onBoard: (board: BoardDocument) => void
  },
): () => void {
  return receiveTransfer(code, {
    ...options,
    onContent: (content) => {
      if (content.kind !== 'board') {
        options.onError(
          new Error('This QR code contains an image, not a complete board.'),
        )
        return
      }
      options.onBoard(content.board)
    },
  })
}

export function validateBoardTransferEnvelope(
  value: unknown,
): value is BoardTransferEnvelope {
  try {
    return parseEnvelope(value).kind === 'board'
  } catch {
    return false
  }
}

export function validateTransferEnvelope(
  value: unknown,
): value is TransferEnvelope {
  try {
    parseEnvelope(value)
    return true
  } catch {
    return false
  }
}

export function transferCodeFromValue(value: string): string | null {
  if (isValidTransferCode(value)) return normalizeTransferCode(value)
  try {
    const url = new URL(value)
    const parameters = new URLSearchParams(url.hash.slice(1))
    const code = parameters.get('send') ?? parameters.get('take')
    return code && isValidTransferCode(code)
      ? normalizeTransferCode(code)
      : null
  } catch {
    return null
  }
}
