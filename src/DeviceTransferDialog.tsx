import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowRight,
  Camera,
  Check,
  FileJson,
  Image as ImageIcon,
  Keyboard,
  LoaderCircle,
  ShieldCheck,
  Smartphone,
  Upload,
  X,
} from 'lucide-react'
import QRCode from 'qrcode'
import { isBoardDocument } from './board'
import TransferHelp from './TransferHelp'
import {
  formatTransferCode,
  isValidTransferCode,
  normalizeTransferCode,
  receiveTransfer,
  startOutgoingTransfer,
  transferCodeFromValue,
  type TransferContent,
  type TransferSession,
  type TransferStatus,
} from './transfer'

interface DeviceTransferDialogProps {
  mode: 'send' | 'receive'
  initialCode?: string
  onClose: () => void
  onAccept: (content: TransferContent) => void
}

interface DetectedBarcode {
  rawValue: string
}

interface BarcodeDetectorInstance {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>
}

type BarcodeDetectorConstructor = new (options: {
  formats: string[]
}) => BarcodeDetectorInstance

function getBarcodeDetector(): BarcodeDetectorConstructor | undefined {
  return (
    window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
  ).BarcodeDetector
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () =>
      reject(reader.error ?? new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

function getImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('The selected image could not be read.'))
    image.src = src
  })
}

async function contentFromFile(file: File): Promise<TransferContent> {
  if (file.type.startsWith('image/')) {
    const src = await readFileAsDataUrl(file)
    const size = await getImageSize(src)
    return {
      kind: 'image',
      image: {
        name: file.name,
        type: file.type,
        src,
        ...size,
      },
    }
  }

  const parsed: unknown = JSON.parse(await file.text())
  if (!isBoardDocument(parsed)) {
    throw new Error('Choose a CoLab Board project or an image.')
  }
  return { kind: 'board', board: parsed }
}

function contentTitle(content: TransferContent): string {
  return content.kind === 'board' ? content.board.title : content.image.name
}

function CameraScanner({
  onCode,
  onCancel,
}: {
  onCode: (code: string) => void
  onCancel: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | undefined>(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    let stopped = false
    const Detector = getBarcodeDetector()
    if (!Detector) {
      setError('QR camera scanning is not available in this browser. Enter the code instead.')
      return
    }
    const detector = new Detector({ formats: ['qr_code'] })

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      .then(async (stream) => {
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        const scan = async () => {
          if (stopped || !videoRef.current) return
          try {
            const results = await detector.detect(videoRef.current)
            const code = results[0]
              ? transferCodeFromValue(results[0].rawValue)
              : null
            if (code) {
              onCode(code)
              return
            }
          } catch (scanError: unknown) {
            if (!stopped) {
              setError(
                scanError instanceof Error
                  ? scanError.message
                  : 'The camera could not scan this QR card.',
              )
            }
          }
          frameRef.current = window.setTimeout(scan, 280)
        }
        scan()
      })
      .catch((cameraError: unknown) => {
        setError(
          cameraError instanceof Error
            ? cameraError.message
            : 'Camera permission was not granted.',
        )
      })

    return () => {
      stopped = true
      window.clearTimeout(frameRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [onCode])

  return (
    <div className="camera-scanner">
      <video ref={videoRef} muted playsInline aria-label="QR card camera" />
      <div className="camera-frame" aria-hidden="true" />
      <div className="camera-copy">
        <Camera />
        <strong>Hold the device’s QR card inside the frame</strong>
        <span>The board connects as soon as the code is recognized.</span>
      </div>
      {error && <p className="transfer-error">{error}</p>}
      <button type="button" onClick={onCancel}>
        <Keyboard /> Enter code instead
      </button>
    </div>
  )
}

export default function DeviceTransferDialog({
  mode,
  initialCode,
  onClose,
  onAccept,
}: DeviceTransferDialogProps) {
  const [content, setContent] = useState<TransferContent | null>(null)
  const [incoming, setIncoming] = useState<TransferContent | null>(null)
  const [session, setSession] = useState<TransferSession | null>(null)
  const [status, setStatus] = useState<TransferStatus>('starting')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [code, setCode] = useState(
    initialCode ? formatTransferCode(initialCode) : '',
  )
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  const autoConnected = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode !== 'send' || !content) return
    setError('')
    try {
      const nextSession = startOutgoingTransfer(content, {
        intent: 'send',
        onStatus: setStatus,
        onError: (nextError) => setError(nextError.message),
      })
      setSession(nextSession)
      cleanupRef.current = nextSession.close
      QRCode.toDataURL(nextSession.link, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 340,
        color: { dark: '#171020', light: '#f3eefb' },
      })
        .then(setQrDataUrl)
        .catch(() => setError('The QR card could not be created.'))
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'The transfer could not be started.',
      )
    }
    return () => cleanupRef.current?.()
  }, [content, mode])

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    cleanupRef.current?.()
    setSession(null)
    setQrDataUrl('')
    setError('')
    try {
      setContent(await contentFromFile(file))
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'The selected content could not be prepared.',
      )
    }
  }

  const connect = (nextCode = code) => {
    const normalized = normalizeTransferCode(nextCode)
    if (!isValidTransferCode(normalized)) {
      setError('Enter all 8 characters shown on the personal device.')
      return
    }
    cleanupRef.current?.()
    setScanning(false)
    setCode(formatTransferCode(normalized))
    setError('')
    try {
      cleanupRef.current = receiveTransfer(normalized, {
        onStatus: setStatus,
        onContent: setIncoming,
        onError: (nextError) => setError(nextError.message),
      })
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'The board could not connect to that device.',
      )
    }
  }

  useEffect(() => {
    if (mode === 'receive' && initialCode && !autoConnected.current) {
      autoConnected.current = true
      connect(initialCode)
    }
  }, [initialCode, mode])

  useEffect(() => () => cleanupRef.current?.(), [])

  return (
    <div className="modal-backdrop transfer-backdrop" onPointerDown={onClose}>
      <section
        className="transfer-dialog device-transfer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-transfer-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="transfer-heading">
            <span className="transfer-icon" aria-hidden="true">
              {mode === 'send' ? <Smartphone /> : <Upload />}
            </span>
            <div>
              <span className="eyebrow">
                {mode === 'send' ? 'PERSONAL DEVICE' : 'SHARED BOARD'}
              </span>
              <h2 id="device-transfer-title">
                {mode === 'send' ? 'Send to a board.' : 'Add from a device.'}
              </h2>
            </div>
          </div>
          <div className="transfer-header-actions">
            <TransferHelp />
            <button
              type="button"
              aria-label="Close device transfer"
              onClick={onClose}
            >
              <X />
            </button>
          </div>
        </header>

        {mode === 'send' ? (
          <>
            {!content ? (
              <button
                className="transfer-file-drop"
                type="button"
                onClick={() => fileInput.current?.click()}
              >
                <span>
                  <Upload />
                </span>
                <strong>Choose content to send</strong>
                <small>CoLab project, PNG, JPEG, GIF, WebP, or SVG</small>
              </button>
            ) : (
              <>
                <div className="outgoing-content">
                  {content.kind === 'board' ? <FileJson /> : <ImageIcon />}
                  <span>
                    <small>
                      {content.kind === 'board' ? 'COLAB PROJECT' : 'IMAGE'}
                    </small>
                    <strong>{contentTitle(content)}</strong>
                  </span>
                  <button type="button" onClick={() => fileInput.current?.click()}>
                    Replace
                  </button>
                </div>
                <div className="device-share-grid">
                  <div className="qr-stage compact">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="QR card for sending this content" />
                    ) : (
                      <LoaderCircle className="is-spinning" />
                    )}
                  </div>
                  <div className="device-share-instructions">
                    <span>ON THE SHARED BOARD</span>
                    <ol>
                      <li>Choose <strong>Add from device</strong></li>
                      <li>Enter this code or scan the QR card</li>
                      <li>Review and accept the content</li>
                    </ol>
                    {session && (
                      <strong className="large-transfer-code">
                        {formatTransferCode(session.code)}
                      </strong>
                    )}
                    <span className={`device-transfer-status is-${status}`}>
                      {status === 'complete' ? <Check /> : <LoaderCircle />}
                      {status === 'ready'
                        ? 'Waiting for the board'
                        : status === 'complete'
                          ? 'Delivered'
                          : 'Preparing transfer'}
                    </span>
                  </div>
                </div>
              </>
            )}
            <input
              ref={fileInput}
              className="hidden-input"
              type="file"
              accept=".json,.colab.json,application/json,image/*"
              onChange={chooseFile}
            />
          </>
        ) : scanning ? (
          <CameraScanner
            onCode={(scannedCode) => connect(scannedCode)}
            onCancel={() => setScanning(false)}
          />
        ) : incoming ? (
          <div className="incoming-preview">
            <div className="incoming-visual">
              {incoming.kind === 'image' ? (
                <img src={incoming.image.src} alt="" />
              ) : (
                <FileJson />
              )}
            </div>
            <span className="eyebrow">READY TO ADD</span>
            <h3>{contentTitle(incoming)}</h3>
            <p>
              {incoming.kind === 'board'
                ? `${incoming.board.items.length} objects and ${incoming.board.timeline.length} replay events will be placed near the current view.`
                : `${incoming.image.width} × ${incoming.image.height} image will be placed at the center of the current view.`}
            </p>
            <div className="transfer-actions">
              <button type="button" onClick={onClose}>Reject</button>
              <button
                className="primary"
                type="button"
                onClick={() => onAccept(incoming)}
              >
                Add to board <ArrowRight />
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="transfer-intro">
              On the personal device, open CoLab Board and choose
              <strong> Send to a board</strong>. Then enter its code here or scan
              the QR card.
            </p>
            <label className="code-entry">
              <span>8-CHARACTER TRANSFER CODE</span>
              <input
                value={code}
                inputMode="text"
                autoCapitalize="characters"
                maxLength={9}
                placeholder="ABCD EFGH"
                onChange={(event) =>
                  setCode(formatTransferCode(event.target.value))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') connect()
                }}
              />
            </label>
            <div className="receive-methods">
              <button
                className="primary"
                type="button"
                onClick={() => connect()}
              >
                <Keyboard /> Connect with code
              </button>
              <span>or</span>
              <button type="button" onClick={() => setScanning(true)}>
                <Camera /> Scan QR card
              </button>
            </div>
            {(status === 'connecting' || status === 'sending') && (
              <div className="connecting-state">
                <LoaderCircle className="is-spinning" />
                Connecting to the personal device…
              </div>
            )}
            <div className="transfer-trust">
              <ShieldCheck />
              <span>
                <strong>Nothing arrives without approval</strong>
                Preview first · accept or reject · current board stays intact
              </span>
            </div>
          </>
        )}

        {error && <p className="transfer-error">{error}</p>}
      </section>
    </div>
  )
}
