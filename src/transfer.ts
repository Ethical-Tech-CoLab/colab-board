import Peer, { type DataConnection, util } from 'peerjs'
import type { BoardDocument } from './types'
import { isBoardDocument } from './board'

export const TRANSFER_PROTOCOL = 'ethical-tech-colab-transfer-v1'
export const TRANSFER_TTL_MS = 10 * 60 * 1_000
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

export interface BoardTransferEnvelope {
  protocol: typeof TRANSFER_PROTOCOL
  kind: 'board'
  createdAt: number
  expiresAt: number
  board: BoardDocument
}

export interface TransferSession {
  code: string
  link: string
  close: () => void
}

interface OutgoingOptions {
  code?: string
  onStatus: (status: TransferStatus) => void
  onError: (error: Error) => void
}

interface IncomingOptions {
  onStatus: (status: TransferStatus) => void
  onBoard: (board: BoardDocument) => void
  onError: (error: Error) => void
}

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback)
}

function peerIdForCode(code: string): string {
  return `${PEER_PREFIX}${normalizeTransferCode(code).toLowerCase()}`
}

function connectionError(
  connection: DataConnection,
  onError: (error: Error) => void,
) {
  connection.on('error', (error) => {
    onError(asError(error, 'The device connection was interrupted.'))
  })
}

function parseEnvelope(value: unknown): BoardTransferEnvelope {
  if (
    !value ||
    typeof value !== 'object' ||
    !('protocol' in value) ||
    value.protocol !== TRANSFER_PROTOCOL ||
    !('kind' in value) ||
    value.kind !== 'board' ||
    !('expiresAt' in value) ||
    typeof value.expiresAt !== 'number' ||
    !('board' in value) ||
    !isBoardDocument(value.board)
  ) {
    throw new Error('The transfer did not contain a valid CoLab Board.')
  }
  if (Date.now() > value.expiresAt) {
    throw new Error('This transfer has expired.')
  }
  return value as BoardTransferEnvelope
}

async function decodeEnvelope(data: unknown): Promise<BoardTransferEnvelope> {
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

export function supportsPeerTransfer(): boolean {
  return util.supports.data
}

export function startOutgoingBoardTransfer(
  board: BoardDocument,
  options: OutgoingOptions,
): TransferSession {
  if (!supportsPeerTransfer()) {
    throw new Error('This browser does not support device-to-device transfer.')
  }

  const code = normalizeTransferCode(options.code ?? generateTransferCode())
  const peer = new Peer(peerIdForCode(code), { debug: 1 })
  const expiresAt = Date.now() + TRANSFER_TTL_MS
  let delivered = false
  let expiryTimer = 0

  const close = () => {
    window.clearTimeout(expiryTimer)
    peer.destroy()
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
    connectionError(connection, options.onError)
    connection.on('open', () => {
      options.onStatus('sending')
      const envelope = createBoardTransferEnvelope(board)
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
  })
  peer.on('error', (error) => {
    const message =
      error.type === 'unavailable-id'
        ? 'That transfer code is already in use. Try creating another.'
        : 'The transfer service could not be reached.'
    options.onStatus('error')
    options.onError(asError(error, message))
  })

  return {
    code,
    link: createTransferLink(code),
    close,
  }
}

export function receiveBoardTransfer(
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
  const close = () => {
    window.clearTimeout(timeout)
    connection?.close()
    peer.destroy()
  }

  options.onStatus('starting')
  peer.on('open', () => {
    options.onStatus('connecting')
    connection = peer.connect(peerIdForCode(code), {
      reliable: true,
      serialization: 'binary',
    })
    connectionError(connection, options.onError)
    connection.on('open', () => options.onStatus('sending'))
    connection.on('data', (data) => {
      decodeEnvelope(data)
        .then((envelope) => {
          options.onBoard(envelope.board)
          options.onStatus('received')
          connection?.send('received')
        })
        .catch((error: unknown) => {
          options.onStatus('error')
          options.onError(asError(error, 'The received board could not be read.'))
        })
    })
  })
  peer.on('error', (error) => {
    options.onStatus('error')
    options.onError(
      asError(
        error,
        error.type === 'peer-unavailable'
          ? 'That transfer is no longer available.'
          : 'The transfer service could not be reached.',
      ),
    )
  })
  timeout = window.setTimeout(() => {
    options.onStatus('expired')
    options.onError(new Error('The transfer timed out. Check the code and try again.'))
    close()
  }, 45_000)

  return close
}

export function validateBoardTransferEnvelope(
  value: unknown,
): value is BoardTransferEnvelope {
  try {
    parseEnvelope(value)
    return true
  } catch {
    return false
  }
}
