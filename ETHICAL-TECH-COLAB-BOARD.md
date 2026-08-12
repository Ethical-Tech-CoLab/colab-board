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

## P0 — Fully Responsive and Portrait-Ready Workspace

Make every application surface adapt to the browser viewport, including
portrait-oriented Surface Hubs, tablets, split-screen windows, and compact
laptop browsers.

Requirements:

- Canvas and spatial view always fill the available viewport without clipping.
- Header, tool rail, options, dialogs, and status controls reflow rather than
  overlap at short, narrow, or portrait aspect ratios.
- Preserve usable touch targets and safe areas in every orientation.
- Recalculate Canvas and WebGL dimensions when the viewport or device
  orientation changes.

Acceptance criteria:

- Core drawing, replay, transfer, settings, and 3D workflows remain reachable
  at representative phone, tablet, desktop, and portrait Surface Hub sizes.
- Rotating a device preserves board content, camera state, and selection.
- No horizontal page scrolling or inaccessible off-screen controls.

## P1 — Adjustable Overlay Transparency

Move all application chrome onto a consistent, partially transparent glass
system so the board stays visible beneath the header, tool rail, panels,
dialogs, and floating controls.

Requirements:

- Drive overlay alpha from one semantic theme token.
- Add one Settings slider that adjusts chrome opacity globally.
- Maintain WCAG-readable contrast, visible focus states, and a safe opaque
  fallback when browser blur effects are unavailable.
- Persist the preference locally and include a one-click reset.

Acceptance criteria:

- The header, left tools, settings, menus, replay controls, and other overlays
  respond together without changing canvas content.
- Both bundled themes remain readable at the minimum and maximum setting.

## P1 — Sparkly Multicolor Pen

Add a delightful Surface Hub-inspired pen that lays down animated,
multi-hued sparkle ink while retaining normal whiteboard performance.

Requirements:

- Offer the effect as an additional ink swatch/tool rather than replacing
  existing pen colors.
- Preserve pressure response, erasing, undo/redo, replay, export, and 3D
  dimensional-ink rendering.
- Use deterministic sparkle seeds so saved projects and replay are stable.
- Respect reduced-motion preferences and provide a static multicolor fallback.

Acceptance criteria:

- Sparkle ink looks consistent across live drawing, reopened projects, replay,
  PNG export, and spatial view.
- Dense sparkle strokes remain responsive on a representative Surface Hub.

## P2 — Theme-It Rapid Brand Sampling

Let a facilitator build a temporary local theme pack on any machine by using a
paint-brush sampler for three or four key colors and adding a logo.

Proposed flow:

1. Open **Theme-It** from the theme picker.
2. Sample primary, accent, canvas, and optional surface colors from an
   on-screen image or uploaded brand reference.
3. Add or crop a logo and preview it across board chrome, ink, notes, replay,
   transfer cards, and spatial view.
4. Save the generated theme locally, export it as a portable theme pack, or
   reset to a bundled theme.

Requirements:

- All sampling and logo processing happen locally by default.
- Automatically derive readable foreground, border, hover, and status colors.
- Warn and suggest corrections when contrast is insufficient.
- Keep generated themes compatible with the existing semantic theme variables.

Acceptance criteria:

- A facilitator can create and apply a recognizable branded experience in
  under two minutes without editing code.
- Generated themes survive reload, can be exported/imported, and never alter
  board content.
