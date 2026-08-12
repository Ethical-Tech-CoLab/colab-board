# Ethical Tech CoLab Board

## Vision

A lightweight open-source spatial whiteboard designed for Surface Hub, touch displays, classrooms, innovation studios, researchers, makers, and collaborative workshops.

Unlike a traditional whiteboard, Ethical Tech CoLab Board acts as a spatial thinking surface supporting 2D sketching, dimensional ink, interactive screensavers, workshop replay, and lightweight collaboration.

Hosted entirely from GitHub Pages.

No server required.

---

# Signature Feature: Session Replay Screensaver

Every stroke, sticky note, image placement, movement, zoom, pan, and annotation is recorded as timeline events.

When the board becomes idle:

1. Canvas clears.
2. Session redraws itself.
3. Strokes animate exactly as created.
4. Notes appear in sequence.
5. Images fade in.
6. Board completes.
7. Entire board softly fades.
8. Replay restarts.

Replay modes:

- Exact Replay
- Accelerated Replay
- Artistic Replay
- Ghost Trails
- Infinite Evolution

Replay end effects:

- Fade to White
- Fade to Black
- Particle Dissolve
- Blueprint Burnoff
- Digital Glitch
- Ink Evaporation

---

# Core Capabilities

- Infinite canvas
- Surface Hub touch support
- Surface Pen support
- Surface Dial support
- Autosave
- Local-first storage
- 2D and 3D drawing modes
- Perspective-aware sketching
- Watermark/logo support
- Evidence and provenance layer
- Media embedding
- GitHub Pages deployment

---

# Screensaver Library

- WarGames Terminal
- Puzzle Explosion
- Drawing Explosion
- Ink Drift
- Retro Snake
- Ethical Tech CoLab Galaxy
- Session Replay

---

# Technology Stack

- HTML5
- TypeScript
- Three.js
- WebGPU
- IndexedDB
- Progressive Web App
- File System Access API
- WebHID (optional)

---

# Tagline

Ethical Tech CoLab Board

An open-source spatial thinking surface for learning, teaching, designing, researching, and exploring ideas together.

---

# Product Backlog

## P0 — Take a Board With You by QR Code

Let a participant scan a QR code displayed on the board and save a portable
copy to their phone or tablet.

Proposed flow:

1. User selects **Take this board with you**.
2. Board creates the existing portable `.colab.json` project archive.
3. Board opens a short-lived WebRTC session. The public signaling service sees
   only an ephemeral peer identifier; board content travels directly between
   devices over a DTLS-encrypted data channel.
4. A QR code contains the CoLab Board URL and one-use transfer code.
5. The participant scans the QR code, previews the board metadata, and chooses
   **Save project** or **Open in CoLab Board**.
6. The transfer expires after its first successful download or a short
   time-to-live.

Requirements:

- No account required.
- Signaling service never receives board contents.
- User explicitly initiates every upload.
- QR view clearly shows expiration and transfer status.
- Include a direct share/download option for devices without a camera.
- Small text-only boards may use a fully offline QR payload when they fit
  safely; larger boards use the encrypted relay.
- Show a clear error if a board cannot be prepared or downloaded.

Acceptance criteria:

- A phone can scan, download, and reopen a representative board containing
  ink, notes, images, provenance, and replay events.
- The downloaded project matches the source board.
- Expired and already-consumed links reveal no board data.
- The source board remains usable while the QR is displayed.

## P1 — Send Content From a Personal Device to a Board

Let a participant contribute content from a phone or laptop to the whiteboard
running on a shared display.

Proposed flows:

- **Pairing code:** the shared board displays a short code that the participant
  enters on their device.
- **Board camera:** the participant displays a transfer QR card that the shared
  board scans with its camera.

The participant chooses a CoLab project, image, or supported document. The
shared board previews the incoming content and requires an explicit
**Add to board** action before import.

Requirements:

- Reuse the P0 encrypted, expiring transfer protocol.
- Pairing codes must be short-lived, rate-limited, and resistant to guessing.
- Camera use requires explicit browser permission and offers code entry as a
  fallback.
- Clearly identify the incoming content type and approximate size.
- Never replace the current board without confirmation; import onto the
  current canvas by default.
- Allow the facilitator to disable incoming transfers.

Acceptance criteria:

- A participant can send a project or image to a shared board using either a
  code or QR card.
- The facilitator can preview, accept, or reject the transfer.
- Accepted content appears near the current viewport without disrupting
  existing work.
- Rejected, expired, and malformed transfers leave the board unchanged.

## Transfer Architecture Decision — Implemented in v0.3.0

The GitHub Pages application uses WebRTC data channels for encrypted,
peer-to-peer board transfer. PeerJS provides ephemeral connection signaling;
it does not receive or store the board payload. Sessions use random
eight-character codes, allow one completed delivery, and expire after ten
minutes. GitHub Pages remains the application host and direct project download
remains the offline fallback.
