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
- IndexedDB
- Progressive Web App
- Pointer Events
- WebRTC / PeerJS

---

# Tagline

Ethical Tech CoLab Board

An open-source spatial thinking surface for learning, teaching, designing, researching, and exploring ideas together.

---

# Product Backlog

## P0 — Take a Board With You by QR Code — Implemented in v0.3.0

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

## P1 — Send Content From a Personal Device to a Board — Implemented in v0.4.0

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

### Deferred transfer defect

- [GitHub issue #1](https://github.com/Ethical-Tech-CoLab/colab-board/issues/1):
  mobile QR handoff can intermittently remain on the connected modal even though
  entering the same transfer code completes immediately. Keep code entry and
  project download as the supported workarounds until this is prioritized.

## P0 — Fully Responsive and Portrait-Ready Workspace — Implemented in v0.8.0

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

## P1 — Adjustable Overlay Transparency — Implemented in v0.8.0

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

## P1 — Sparkly Multicolor Pen — Implemented in v0.8.0

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

## P2 — Theme-It Rapid Brand Sampling — Implemented in v0.9.0

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

## Delivery Status Through v0.15.0

### Completed — Replay Studio and screensaver pack

- Exact, Accelerated, Artistic Camera, Ghost Trails, and Infinite Evolution
  treatments use the existing local timeline and retain scrubbing and speed
  controls.
- Fade-to-white/black, particle dissolve, blueprint burnoff, digital glitch,
  and ink evaporation endings prevent an abrupt replay finish.
- WarGames Terminal follows the existing Ethical Tech CoLab War-Games
  repository's worn beige monitor, phosphor-green CRT, scanline glass, flicker,
  refresh roll, monospace hierarchy, and restrained machine voice.
- Retro Snake supplies a contrasting continuously moving arcade scene.

### Completed — Surface hardware and lightweight live boards

- Surface Pen pressure remains native. The rear eraser temporarily erases
  regardless of the toolbar tool, the barrel button moves the canvas without
  drawing, pen hover makes no marks, and pen input remains separate from
  one- and two-finger canvas gestures.
- Surface Dial rotation uses browser wheel events and can control zoom or ink
  size. This avoids unverified WebHID report mappings; the Windows-managed pen
  top button is likewise not exposed to browser applications.
- Live boards are explicit opt-in peer sessions. A host shares an
  eight-character code and sends the initial board over encrypted WebRTC.
  Local-only remains the default. The original snapshot transport in this phase
  was superseded by ordered operations in v0.13.1.

### Completed polish — v0.12.2

- Post-Its use one shared translucent surface treatment in the editable Canvas,
  replay and PNG rendering, and the Three.js Spatial scene.
- Choosing Post-It while in Spatial creates and selects a centered thought card
  without returning to the 2D Canvas; the `N` shortcut follows the same path.
- Spatial badges and perspective controls clear the desktop drawing rail and
  its hover labels, while compact and portrait layouts retain their stacked
  placement.
- Header and Settings glass use a lighter version of the persisted overlay
  opacity so more of the board stays visible beneath application chrome.

### Completed Spatial authoring — v0.13.0

- The shared pen, highlighter, eraser, Post-It, Select, Move, and image tools
  now remain in Spatial instead of silently returning to Canvas.
- Pen and highlighter input raycast onto an adjustable 2.5D work plane. A
  transient Three.js mesh updates during the gesture, then one normal board
  event commits on pointer-up for undo, replay, export, autosave, and live-board
  compatibility.
- Surface Pen pressure, rear eraser, barrel navigation, touch navigation/draw
  preference, Space-drag orbit, and Surface Dial ink-size mode retain their
  established behavior in Spatial.
- Post-Its can be placed at depth and edited in a projected lightweight text
  surface. Images can be inserted or dropped directly into the 3D scene.
- Spatial uses a stable board origin while authoring so off-center additions do
  not recenter and jump the complete scene after each commit.
- The feature adds no dependency and only a few kilobytes to the already
  lazy-loaded Spatial payload.

### Completed live synchronization hardening — v0.13.1

- Replaced whole-board, latest-snapshot synchronization with host-sequenced v2
  operations. Normal edits transmit only changed objects, metadata, and compact
  replay entries; a complete board checkpoint is reserved for join and repair.
- Each participant uses ordered sequence numbers and acknowledgements. Pending
  operations remain queued during reconnect, duplicate retries are idempotent,
  and revision gaps request an authoritative checkpoint rather than continuing
  from divergent state.
- Unrelated simultaneous edits merge instead of replacing the complete board.
  Same-object conflicts remain deterministic latest-host-order wins.
- Ink previews use a throttled ephemeral channel so collaborators see an active
  stroke before pointer-up. The durable stroke still commits once for undo,
  replay, autosave, and efficient transport.
- The live dialog reports direct versus TURN-relayed routing, measured WebRTC
  round-trip time, and pending acknowledgements for real-device diagnosis.
- A representative update on a board containing a 250 KB embedded image is
  regression-tested at less than one percent of the previous snapshot payload.

### Completed seven-party live optimization — v0.14.0

- Live protocol v3 keeps the durable host-sequenced operation model while
  replacing cumulative in-progress strokes with explicit start, compact
  quantized point chunks, and end/cancel updates.
- Each destination receives at most one coalesced preview packet per 50 ms tick.
  WebRTC `bufferedAmount` backpressure retains and replaces ephemeral previews
  without dropping durable operations.
- Ordered commits produced in the same 16 ms window share one packet. In the
  seven-device durable burst this reduced host messages from 42 to six while
  every device converged in 114 ms or less on the direct local route.
- Seven isolated browser contexts converged after simultaneous drawing, after a
  note was committed during the drawing burst, and after one artist went offline
  mid-stroke and reconnected.
- A dense 120-point stroke used about 5.4 KB of preview upload and 26.8 KB of host
  preview fan-out. Seven simultaneous 48-point strokes used about 2.7–3.0 KB of
  preview upload per participant and 64 KB of host preview egress.
- Seven participants are the validated working size. The host should use an
  unmetered desktop connection; larger or TURN-relayed sessions need
  network-specific acceptance testing because star-topology bytes still grow
  with both artists and recipients.

### Completed sharing, media, and screensaver hardening — v0.15.0

- Hosts can copy a full `#session=CODE` link. Opening it starts one automatic
  join attempt, removes the consumed session intent from the address, preserves
  unrelated URL parameters, and offers inline recovery for malformed or failed
  codes.
- Authoritative checkpoints now always reconcile the first join while
  content-identical reconnects preserve local undo and selection state. A
  two-origin WebRTC browser acceptance test confirmed a late join with a stroke
  and edited embedded image, followed by a live host update on a direct route.
- Selected images have transparency and aspect-ratio-locked width controls.
  Preview changes produce one durable undoable commit, survive an immediate
  drag, and persist across Canvas, Spatial, replay, export, autosave, and live
  synchronization.
- Session Replay and Ghost Trails pre-sort once, draw outside React's frame
  render path, avoid repeated canvas backing-store allocation, and cancel work
  before closing. Screensavers snapshot the activation camera and scene mode so
  idle playback reflects the current board window instead of its opening state.
- Water Surface adds a lazy-loaded 512-by-512 Three.js wave plane, up to twelve
  interacting waves, board-object ripple anchors, fitted board reflections, and
  real-time lighting. It removes polling redraws, cleans up GPU resources, honors
  reduced motion, and falls back to the current board plus a lightweight water
  sheen when WebGL is unavailable.
- Native Settings selects use theme-aware colors and forced-color focus
  treatment, preventing unreadable white-on-white options.

## Remaining Priorities — Post-v0.15.0

There is no open P0 blocking normal whiteboard use. The next releases should
finish the original delight promise and harden observed workflows without
turning the application into a dense design or collaboration suite.

### P1 — Complete the signature screensaver library

Add the two concepts still missing from the original library:

- **Puzzle Explosion:** board fragments assemble into the completed composition,
  hold, then separate cleanly before the next cycle.
- **Drawing Explosion:** strokes, notes, and images disperse from their authored
  positions and reform without changing the saved board.

Both modes should use the existing idle/screensaver framework, respect reduced
motion, remain responsive in portrait layouts, clean up timers and Three.js
resources when closed, and add no dependency unless the visual result clearly
justifies it.

### P1 — Real-device Spatial and Surface acceptance pass

Validate v0.13.0 on a physical Surface Hub and Surface laptop with the large and
standard Surface Pens. Cover pressure, rear eraser, barrel navigation, palm
rejection, touch drawing/navigation, rotation into portrait, dropped images,
long strokes, and repeated Canvas/Spatial switching. Fix demonstrated defects;
do not expand the tool model during this pass.

### P2 — Bounded mobile QR reliability pass

[GitHub issue #1](https://github.com/Ethical-Tech-CoLab/colab-board/issues/1)
remains open because a camera-opened mobile receiver can intermittently stay at
**Connected...** while manual code entry succeeds. Add state-transition
diagnostics and test mobile page resume, payload acknowledgement, and timeout
recovery. Keep code entry and project download prominent, and stop the
investigation if a reliable fix would require a hosted content service or
significant transfer architecture.

### P3 — Touch-first multi-object editing

Revisit lasso, multi-select, grouping, locking, and batch movement only after
workshop observation shows a recurring need. Start with a small touch-first
subset and preserve the current low-chrome whiteboard experience; do not adopt a
desktop design-tool inspector by default.

### Deferred until evidence justifies the complexity

- Conflict-aware live collaboration, presence, and CRDT synchronization.
- Arbitrary 3D surfaces, freeform 3D transforms, and CAD-style scene tooling.
- Server accounts, hosted board storage, or mandatory cloud infrastructure.

### Recommended release order

1. **v0.15.0:** Puzzle Explosion and Drawing Explosion.
2. **v0.15.x:** real-device Spatial/Surface fixes discovered during acceptance.
3. **Later maintenance:** one bounded pass on the mobile QR issue.
4. **Research only:** multi-object editing and richer collaboration after real
   workshop demand is documented.
