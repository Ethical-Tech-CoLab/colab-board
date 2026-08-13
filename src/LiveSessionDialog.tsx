import { useState } from 'react'
import {
  Check,
  Copy,
  LoaderCircle,
  RadioTower,
  ShieldCheck,
  Unplug,
  Users,
  X,
} from 'lucide-react'
import { formatTransferCode, normalizeTransferCode } from './transfer'
import type {
  LiveSessionRole,
  LiveSessionStatus,
} from './liveSession'

export interface LiveSessionView {
  code: string
  role: LiveSessionRole
  status: LiveSessionStatus
  error: string
}

interface LiveSessionDialogProps {
  session: LiveSessionView | null
  onHost: () => void
  onJoin: (code: string) => void
  onDisconnect: () => void
  onClose: () => void
}

function statusCopy(status: LiveSessionStatus, role: LiveSessionRole) {
  if (status === 'starting') return 'Starting secure peer session…'
  if (status === 'connecting') return 'Connecting directly to the other board…'
  if (status === 'connected') return 'Live connection active'
  if (status === 'error') return 'Connection needs attention'
  return role === 'host' ? 'Ready for another board' : 'Waiting for host'
}

export default function LiveSessionDialog({
  session,
  onHost,
  onJoin,
  onDisconnect,
  onClose,
}: LiveSessionDialogProps) {
  const [role, setRole] = useState<LiveSessionRole>('host')
  const [code, setCode] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

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
                  onChange={(event) =>
                    setCode(
                      formatTransferCode(normalizeTransferCode(event.target.value)),
                    )
                  }
                />
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
                    session.status === 'connecting'
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
            </div>
            {session.error && <p className="transfer-error">{session.error}</p>}
            <div className="transfer-trust">
              <ShieldCheck />
              <span>
                <strong>Encrypted peer-to-peer while connected</strong>
                Board snapshots travel over WebRTC. A public PeerJS service
                supplies signaling only and does not store the board.
              </span>
            </div>
            <p className="live-conflict-note">
              Lightweight sync uses the latest received board snapshot. If two
              people edit at exactly the same time, the later snapshot can replace
              the earlier one.
            </p>
            <div className="transfer-actions">
              <button type="button" onClick={onDisconnect}>
                <Unplug /> End live session
              </button>
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
