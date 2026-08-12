import {
  CircleHelp,
  Clock3,
  Download,
  Globe2,
  ShieldCheck,
  WifiOff,
} from 'lucide-react'

export default function TransferHelp() {
  return (
    <details className="transfer-help">
      <summary aria-label="Transfer requirements and troubleshooting">
        <CircleHelp />
      </summary>
      <div className="transfer-help-card">
        <span className="eyebrow">TRANSFER HELP</span>
        <h3>What does QR transfer need?</h3>
        <ul>
          <li>
            <Globe2 />
            <span>
              <strong>Two current browsers online</strong>
              Both devices need internet access and WebRTC data channels.
            </span>
          </li>
          <li>
            <Clock3 />
            <span>
              <strong>Keep the source awake</strong>
              Leave its board and QR card open. Connect within 10 minutes; each
              code delivers once.
            </span>
          </li>
          <li>
            <ShieldCheck />
            <span>
              <strong>Encrypted browser-to-browser</strong>
              PeerJS coordinates the connection but never stores the board.
              Camera permission is only needed for in-app QR scanning.
            </span>
          </li>
        </ul>
        <div className="transfer-help-warning">
          <WifiOff />
          <span>
            <strong>If it times out</strong>
            Keep both screens open, then retry. VPNs, captive portals, strict
            corporate or guest Wi-Fi, and blocked WebRTC can prevent a
            connection. Try another network or cellular data.
          </span>
        </div>
        <p>
          <Download />
          A downloaded <strong>.colab.json</strong> project is the reliable
          fallback when a network blocks live transfer.
        </p>
      </div>
    </details>
  )
}
