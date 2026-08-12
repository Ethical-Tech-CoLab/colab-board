import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  LoaderCircle,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react'
import QRCode from 'qrcode'
import {
  clearTransferIntent,
  formatTransferCode,
  receiveBoardTransfer,
  startOutgoingBoardTransfer,
  type TransferSession,
  type TransferStatus,
} from './transfer'
import type { BoardDocument } from './types'

interface TakeBoardDialogProps {
  board: BoardDocument
  receiveCode?: string
  onClose: () => void
  onDownload: (board: BoardDocument) => void
  onOpen: (board: BoardDocument) => void
}

const STATUS_COPY: Record<TransferStatus, string> = {
  starting: 'Opening a private transfer…',
  ready: 'Ready to scan',
  connecting: 'Connecting devices…',
  sending: 'Transferring board…',
  received: 'Board received',
  complete: 'Transfer complete',
  expired: 'Transfer expired',
  error: 'Transfer needs attention',
}

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

export default function TakeBoardDialog({
  board,
  receiveCode,
  onClose,
  onDownload,
  onOpen,
}: TakeBoardDialogProps) {
  const [session, setSession] = useState<TransferSession | null>(null)
  const [status, setStatus] = useState<TransferStatus>('starting')
  const [error, setError] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [receivedBoard, setReceivedBoard] = useState<BoardDocument | null>(null)
  const [copied, setCopied] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  const receiving = Boolean(receiveCode)

  const sourceSize = useMemo(
    () => new Blob([JSON.stringify(receivedBoard ?? board)]).size,
    [board, receivedBoard],
  )

  useEffect(() => {
    try {
      if (receiveCode) {
        cleanupRef.current = receiveBoardTransfer(receiveCode, {
          onStatus: setStatus,
          onBoard: setReceivedBoard,
          onError: (nextError) => setError(nextError.message),
        })
      } else {
        const nextSession = startOutgoingBoardTransfer(board, {
          onStatus: setStatus,
          onError: (nextError) => setError(nextError.message),
        })
        setSession(nextSession)
        cleanupRef.current = nextSession.close
      }
    } catch (nextError: unknown) {
      setStatus('error')
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'The transfer could not be started.',
      )
    }
    return () => cleanupRef.current?.()
  }, [board, receiveCode])

  useEffect(() => {
    if (!session) return
    QRCode.toDataURL(session.link, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
      color: {
        dark: '#171020',
        light: '#f3eefb',
      },
    })
      .then(setQrDataUrl)
      .catch(() => setError('The QR code could not be created.'))
  }, [session])

  const close = () => {
    if (receiving) clearTransferIntent()
    onClose()
  }

  const copyLink = async () => {
    if (!session) return
    try {
      await navigator.clipboard.writeText(session.link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('The link could not be copied. Select and copy it manually.')
    }
  }

  return (
    <div className="modal-backdrop transfer-backdrop" onPointerDown={close}>
      <section
        className="transfer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="transfer-heading">
            <span className="transfer-icon" aria-hidden="true">
              {receiving ? <Smartphone /> : <QrCode />}
            </span>
            <div>
              <span className="eyebrow">
                {receiving ? 'BOARD HANDOFF' : 'TAKE IT WITH YOU'}
              </span>
              <h2 id="transfer-title">
                {receiving ? 'Your board has arrived.' : 'Scan. Save. Keep thinking.'}
              </h2>
            </div>
          </div>
          <button type="button" aria-label="Close transfer" onClick={close}>
            <X />
          </button>
        </header>

        {receiving ? (
          receivedBoard ? (
            <div className="received-board">
              <div className="received-preview">
                <div className="received-mark">
                  <Check />
                </div>
                <span>RECEIVED SECURELY</span>
                <h3>{receivedBoard.title}</h3>
                <dl>
                  <div>
                    <dt>Objects</dt>
                    <dd>{receivedBoard.items.length}</dd>
                  </div>
                  <div>
                    <dt>Replay events</dt>
                    <dd>{receivedBoard.timeline.length}</dd>
                  </div>
                  <div>
                    <dt>Project size</dt>
                    <dd>{formatBytes(sourceSize)}</dd>
                  </div>
                </dl>
              </div>
              <p>
                Save a portable copy, or open it here as this device’s active
                board.
              </p>
              <div className="transfer-actions">
                <button type="button" onClick={() => onDownload(receivedBoard)}>
                  <Download /> Save project
                </button>
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    clearTransferIntent()
                    onOpen(receivedBoard)
                  }}
                >
                  <ExternalLink /> Open in CoLab Board
                </button>
              </div>
            </div>
          ) : (
            <div className="transfer-waiting">
              <LoaderCircle className="is-spinning" />
              <h3>{STATUS_COPY[status]}</h3>
              <p>
                Keep this page open while it connects to the board that showed
                the QR code.
              </p>
            </div>
          )
        ) : (
          <>
            <p className="transfer-intro">
              Point your phone camera at this code. The complete board travels
              directly between your devices and is never stored on a server.
            </p>
            <div className="qr-stage">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code for this board transfer" />
              ) : (
                <LoaderCircle className="is-spinning" />
              )}
              <span className={`transfer-status is-${status}`}>
                {status === 'complete' ? <Check /> : <Wifi />}
                {STATUS_COPY[status]}
              </span>
            </div>
            {session && (
              <div className="transfer-code">
                <span>TRANSFER CODE</span>
                <strong>{formatTransferCode(session.code)}</strong>
                <button type="button" onClick={copyLink}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            )}
            <div className="transfer-trust">
              <ShieldCheck />
              <span>
                <strong>Private by design</strong>
                Encrypted peer-to-peer · one delivery · expires in 10 minutes
              </span>
            </div>
            <button
              className="download-fallback"
              type="button"
              onClick={() => onDownload(board)}
            >
              <Download /> No camera? Download the project instead
            </button>
          </>
        )}

        {error && <p className="transfer-error">{error}</p>}
      </section>
    </div>
  )
}
