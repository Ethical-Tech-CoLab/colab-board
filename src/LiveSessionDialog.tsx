import { useState } from 'react'
import {
  Check,
  Copy,
  Link,
  LoaderCircle,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Users,
  X,
} from 'lucide-react'
import { formatTransferCode, normalizeTransferCode, createLiveSessionLink } from './transfer'
import type {
  LiveSessionDiagnostics,
  LiveSessionRole,
  LiveSessionStatus,
} from './liveSession'

export interface LiveSessionView {
  code: string
  role: LiveSessionRole
  status: LiveSessionStatus
  error: string
  diagnostics: LiveSessionDiagnostics
}

interface LiveSessionDialogProps {
  session: LiveSessionView | null
  initialCode?: string
  initialCodeError?: string
  onHost: () => void
  onJoin: (code: string) => void
  onDisconnect: () => void
  onClose: () => void
}

function statusCopy(status: LiveSessionStatus, role: LiveSessionRole) {
  if (status === 'starting') return 'Starting secure peer session…'
  if (status === 'connecting') return 'Connecting directly to the other board…'
  if (status === 'reconnecting') return 'Reconnecting and preserving changes…'
  if (status === 'connected') return 'Live connection active'
  if (status === 'error') return 'Connection needs attention'
  return role === 'host' ? 'Ready for another board' : 'Waiting for host'
}

export default function LiveSessionDialog({
  session,
  initialCode,
  initialCodeError,
  onHost,
  onJoin,
  onDisconnect,
  onClose,
}: LiveSessionDialogProps) {
  const [role, setRole] = useState<LiveSessionRole>(
    initialCode !== undefined ? 'join' : 'host',
  )
  const [code, setCode] = useState(
    initialCode !== undefined
      ? formatTransferCode(normalizeTransferCode(initialCode))
      : '',
  )
  const [codeError, setCodeError] = useState(initialCodeError ?? '')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [copyUrlState, setCopyUrlState] = useState<'idle' | 'copied' | 'error'>('idle')

  const copyCode = async () => {
    if (!session) return
    try {
      await navigator.clipboard.writeText(formatTransferCode(session.code))
      setCopyState('copied')
    } catch (error: unknown) {
      console.error('Live session code could not be copied.', error)
      setCopyState('error')
    }
  }

  const copyJoinUrl = async () => {
    if (!session) return
    try {
      await navigator.clipboard.writeText(createLiveSessionLink(session.code))
      setCopyUrlState('copied')
    } catch (error: unknown) {
      console.error('Live session join URL could not be copied.', error)
      setCopyUrlState('error')
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <section
        className="transfer-dialog live-session-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-session-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="transfer-heading">
            <div className="transfer-icon">
              <RadioTower />
            </div>
            <div>
              <span className="eyebrow">OPT-IN PEER CONNECTION</span>
              <h2 id="live-session-title">Live board</h2>
            </div>
          </div>
          <div className="transfer-header-actions">
            <button type="button" aria-label="Close live session" onClick={onClose}>
              <X />
            </button>
          </div>
        </header>

        {!session ? (
          <>
            <p className="transfer-intro">
              Work on one board from two browsers. Your board remains local by
              default; a live connection starts only when you choose Host or Join.
            </p>
            <div className="live-session-choices">
              <button
                type="button"
                className={role === 'host' ? 'is-active' : ''}
                onClick={() => setRole('host')}
              >
                <RadioTower />
                <strong>Host this board</strong>
                <span>Create a short code and send this board first.</span>
              </button>
              <button
                type="button"
                className={role === 'join' ? 'is-active' : ''}
                onClick={() => setRole('join')}
              >
                <Users />
                <strong>Join a board</strong>
                <span>Enter the code shown by the host.</span>
              </button>
            </div>
            {role === 'join' && (
              <label className="live-code-input">
                Host code
                <input
                  value={code}
                  maxLength={9}
                  inputMode="text"
                  autoCapitalize="characters"
                  placeholder="ABCD EFGH"
                  onChange={(event) => {
                    setCode(
                      formatTransferCode(normalizeTransferCode(event.target.value)),
                    )
                    setCodeError('')
                  }}
                />
                {codeError && <span className="transfer-error">{codeError}</span>}
              </label>
            )}
            <div className="transfer-actions">
              <button
                className="primary"
                type="button"
                disabled={role === 'join' && normalizeTransferCode(code).length !== 8}
                onClick={() =>
                  role === 'host'
                    ? onHost()
                    : onJoin(normalizeTransferCode(code))
                }
              >
                <RadioTower />
                {role === 'host' ? 'Start live board' : 'Connect to host'}
              </button>
            </div>
          </>
        ) : (
          <div className="live-session-state">
            <div
              className={`live-status is-${session.status}`}
              aria-live="polite"
            >
              {session.status === 'connected' || session.status === 'ready' ? (
                <Check />
              ) : (
                <LoaderCircle
                  className={
                    session.status === 'starting' ||
                    session.status === 'connecting' ||
                    session.status === 'reconnecting'
                      ? 'is-spinning'
                      : ''
                  }
                />
              )}
              <span>
                <strong>{statusCopy(session.status, session.role)}</strong>
                <small>
                  {session.role === 'host'
                    ? 'This device is the host.'
                    : 'This device joined the host board.'}
                </small>
              </span>
            </div>
            <div className="transfer-code">
              <span>LIVE SESSION CODE</span>
              <strong>{formatTransferCode(session.code)}</strong>
              <button type="button" onClick={copyCode}>
                {copyState === 'copied' ? <Check /> : <Copy />}
                {copyState === 'copied'
                  ? 'Copied'
                  : copyState === 'error'
                    ? 'Copy failed'
                    : 'Copy'}
              </button>
              {session.role === 'host' && (
                <button type="button" onClick={copyJoinUrl}>
                  {copyUrlState === 'copied' ? <Check /> : <Link />}
                  {copyUrlState === 'copied'
                    ? 'Link copied'
                    : copyUrlState === 'error'
                      ? 'Copy failed'
                      : 'Copy join URL'}
                </button>
              )}
            </div>
            {session.error && <p className="transfer-error">{session.error}</p>}
            <div className="transfer-trust">
              <ShieldCheck />
              <span>
                <strong>Encrypted peer-to-peer while connected</strong>
                Ordered board changes travel over WebRTC. Full checkpoints are
                reserved for joining and recovery. A public PeerJS service supplies
                signaling only and does not store the board.
              </span>
            </div>
            <p className="live-diagnostics">
              <strong>
                {session.diagnostics.route === 'relay'
                  ? 'TURN relay route'
                  : session.diagnostics.route === 'direct'
                    ? 'Direct peer route'
                    : 'Measuring peer route'}
              </strong>
              <span>
                {session.diagnostics.roundTripMs === null
                  ? 'Round-trip time pending'
                  : `${session.diagnostics.roundTripMs} ms round trip`}
                {' · '}
                {session.diagnostics.pendingChanges === 0
                  ? 'All changes acknowledged'
                  : `${session.diagnostics.pendingChanges} change${
                      session.diagnostics.pendingChanges === 1 ? '' : 's'
                    } queued`}
              </span>
            </p>
            <p className="live-conflict-note">
              Changes to different objects merge in host order. If two people edit
              the same object at once, the host&apos;s latest ordered change wins.
              Unacknowledged work is retained and replayed after reconnection.
            </p>
            <div className="transfer-actions">
              <button type="button" onClick={onDisconnect}>
                <Unplug /> End live session
              </button>
              {session.role === 'join' && session.status === 'error' && (
                <button
                  type="button"
                  onClick={() => {
                    setCode(formatTransferCode(session.code))
                    setRole('join')
                    setCodeError('')
                    onDisconnect()
                  }}
                >
                  <RefreshCw /> Try another code
                </button>
              )}
              <button className="primary" type="button" onClick={onClose}>
                Keep working
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
