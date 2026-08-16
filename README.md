# Ethical Tech CoLab Board

**[Open the live CoLab Board →](https://ethical-tech-colab.github.io/colab-board/)**

A local-first spatial thinking surface for touch displays, classrooms, studios, and collaborative workshops. It runs entirely in the browser and can be hosted on GitHub Pages without a server.

## Current release — v0.15.0

- Pressure-aware pen and highlighter input with Surface Pen rear-eraser and
  barrel-button canvas movement
- Surface-style touch input: one finger grabs the complete canvas, two fingers
  pinch, and a stylus draws; Settings can switch finger input back to drawing
- Infinite pan-and-zoom canvas with mouse, touch, and pen support
- Translucent sticky notes across the editable Canvas, replay/export rendering,
  and Spatial view
- Native Spatial pen, highlighter, rear-eraser, and touch-drawing input with a
  transient Three.js preview that commits only when the stroke finishes
- Direct Spatial Post-It placement and text editing, plus image insertion and
  drag-and-drop at an adjustable work-plane depth
- Spatial selection, orbit, Surface Pen barrel movement, Surface Dial ink-size
  adjustment, and responsive controls that stay clear of the drawing rail
- Images with selected-image transparency and aspect-ratio-locked sizing, plus
  eraser, selection, undo, and redo
- IndexedDB autosave with portable JSON project files and PNG export
- Branded PNG exports with a visible live-site link and scannable return QR code
- Export footers include the active theme logo or mark and size the return QR to
  the four- or five-line footer text block
- Event provenance and animated replay scoped to work after the latest clear
- Replay Studio with Exact, Accelerated, Artistic Camera, Ghost Trails, and
  Infinite Evolution treatments plus six selectable ending effects
- Continuously moving Session Replay, Ink Drift, wide-orbit CoLab Galaxy, Aurora
  Flow, and Idea Constellation screensavers
- A lazy-loaded Three.js Water Surface screensaver with active-viewport reflections,
  object-anchored ripples, interacting waves, live lighting, reduced-motion
  behavior, configurable drop rate/location/style/count/intensity/speed, a Slow
  cadence with localized outward-moving wavefronts that fully fade before three
  quiet seconds, a calm half-speed default, and a lightweight 2D fallback when
  WebGL is unavailable
- WarGames Terminal, faithfully adapted from the Ethical Tech CoLab
  [War-Games](https://github.com/Ethical-Tech-CoLab/War-Games) design system,
  and a moving Retro Snake screensaver
- Idle detection covers the full application and stays suspended while modal
  transfer, help, or Theme-It workflows are open
- Collapsible right-hand board settings panel
- Full-viewport responsive layouts for compact landscape, tablet portrait, and
  portrait-oriented shared displays
- One global, persisted glass-overlay opacity control with a quick reset;
  header and Settings glass stay especially light so the canvas remains visible
- QR board handoff with one-use, encrypted peer-to-peer transfer
- Mobile receiving preview with Save Project and Open in CoLab Board actions
- Personal-device-to-board intake for CoLab projects and images using a short
  code or camera-scanned QR card
- Explicitly opt-in live peer boards with host/join codes, encrypted WebRTC
  transport, initial host checkpoint, connection status, and local-only default
- Shareable `#session=CODE` links that auto-join once, preserve unrelated URL
  parameters, and provide recoverable validation when a code is malformed
- Host-sequenced live operations merge edits to different objects without
  retransmitting the complete board; acknowledgements, queued retries, and
  recovery checkpoints prevent silent state loss after a connection interruption
- Live protocol v3 sends quantized point deltas instead of repeatedly sending the
  complete in-progress stroke, batches host fan-out and durable commits, and
  coalesces stale previews under WebRTC backpressure
- Live ink previews appear before pointer-up while durable strokes still commit
  once, keeping replay, undo, and autosave exact
- Live-session diagnostics identify direct versus TURN-relayed routes, round-trip
  time, and unacknowledged changes
- Facilitator preview and explicit accept/reject before incoming content is
  placed near the current view without replacing existing work
- Installable PWA with an offline application shell
- Runtime-swappable brand themes with the Ethical Tech CoLab website identity
  active by default, plus The Garage Crimson, The Garage · CoLab, Warm Studio,
  Signal Lab, Civic Ocean, and Sunrise Commons packs
- Local Theme-It wizard with uploaded-reference and screen color sampling,
  primary/accent/canvas/surface controls, local logo support, automatic contrast
  derivation, live preview, persistence, and portable theme pack import/export
- Dense Surface-inspired rainbow glitter ink with smooth color travel and
  deterministic micro-sparkles across drawing, autosave, replay, PNG rendering,
  and the Three.js spatial view
- Opt-in Three.js spatial editor with orbit navigation, floating object layers,
  dimensional pressure-aware ink, illuminated notes, and image panels
- Persistent spatial transforms for object depth, X/Y tilt, rotation, and scale
  with quick layer actions, reset, keyboard depth nudging, and undo/redo
- Switchable spatial grid, one-point, and two-point perspective guides
- Browser-native Surface Dial/wheel preference for canvas zoom or ink-size
  adjustment, with Ctrl-wheel zoom retained in ink-size mode
- Streamlined header actions with media insertion kept in the left tool rail
- Smooth replay fade-out at the end of manual and idle Session Replay
- Replay and Ghost Trails draw without per-frame React renders or timeline
  sorting, exit immediately on input, and begin from the current camera and scene

## Run locally

```sh
npm install
npm run dev
```

Use `npm run build` to type-check and create the production site in `dist/`. Use `npm test` for the state and replay tests.

## GitHub Pages

The included Pages workflow deploys `dist/` on pushes to `main`. In the repository settings, set Pages to use **GitHub Actions** as its source.

All board content stays on the device unless a user explicitly exports a project or image.
QR handoff uses the public PeerJS service for ephemeral connection signaling;
board content itself travels directly between devices over an encrypted WebRTC
data channel and is not stored by the signaling service.

Live boards use the same signaling and encrypted peer transport. The host sends
one complete checkpoint when a participant joins or requests recovery. Normal
work travels as small, ordered object and replay-event patches with per-device
sequence numbers and acknowledgements. Unacknowledged changes remain queued
across a reconnect, and each applied remote operation enters normal local
autosave.

Edits to different objects merge in host order. If participants change the same
object concurrently, the latest host-ordered change wins; this intentionally
avoids CRDT and account/server complexity while preventing unrelated work from
being dropped.

### Live-session scale and data use

v0.14.0 is acceptance-tested with one host and six participants in isolated
browser contexts. Seven concurrent durable edits converged on every device in
114 ms or less on a direct local route. Commit batching reduced that burst from
42 host messages to six. Concurrent drawing, a durable note added during the
drawing burst, and a participant going offline mid-stroke all recovered to the
same item and timeline counts on every device.

Traffic depends on point density, active drawing time, participant count, and
whether WebRTC uses a direct or TURN-relayed route. Representative application
payload measurements, excluding IP/UDP/DTLS/SCTP overhead, are:

- A dense 120-point, 2.4-second live stroke used about 5.4 KB of preview upload
  from the artist, 5.4 KB of preview download per passive participant, and
  26.8 KB of host preview fan-out.
- Seven simultaneous 48-point strokes over about one second used roughly
  2.7–3.0 KB of preview upload and 10–11 KB of preview download per participant;
  the host sent about 64 KB of previews.
- Seven simultaneous sticky-note commits used about 475 B of participant upload.
  Each participant received one roughly 3.1 KB commit bundle; the host sent six
  bundles totaling about 18.7 KB.

Continuous drawing is an intentionally harsh upper bound. For the seven-person
all-drawing preview sample, the measured rate extrapolates to roughly 45 MB/hour
per participant and 210 MB/hour of host egress before durable stroke commits.
Real network accounting is commonly 10–25% higher, and each completed stroke
adds a durable patch whose size grows with its final point count. At a
hypothetical $10/GB, that preview-only stress rate is about $0.45 per participant
hour and $2.10 per host hour. Normal workshops should be substantially lower
because participants spend most of their time talking, moving notes, or idle.

Seven participants are validated and are the recommended current working size.
The star topology still makes host bytes grow with both active artists and
recipients, even though message batching removes most per-author packet fan-out.
Use a desktop or unmetered connection for the host, especially on a TURN relay.
Larger sessions should be benchmarked on their real network before facilitation.

### Live-session join URLs

When hosting, the Live board dialog exposes two copy actions:

- **Copy** — copies the 8-character code (`ABCD 1234`) for manual entry.
- **Copy join URL** — copies a full URL (`https://…/#session=ABCD1234`) that
  recipients can open directly in a browser to skip manual code entry.

Opening a join URL opens the Live board dialog and immediately attempts to
connect to the host without requiring the code to be typed.  The join code is
embedded in the URL **hash fragment** (`#session=CODE`), which is never sent to
a web server — it stays in the browser and is shared only between the host and
the participant.  All subsequent board data travels over the same encrypted,
peer-to-peer WebRTC channel described above.

If the session is no longer available (host has disconnected) or the code is
malformed, the existing peer-unavailable error is surfaced and the user can
correct or re-enter the code manually.  The hash parameter is removed from the
URL as soon as the join attempt begins, so reloading the page does not trigger
a second attempt.  Other hash or query parameters present in the URL are
preserved.

**Privacy summary:** The join URL embeds the session code in the fragment
identifier only.  No CoLab server, analytics endpoint, or PeerJS signaling
server receives the code via this URL; it is processed entirely in the
recipient's browser before any network request is made.



- Both devices need a current browser with WebRTC data-channel support and
  internet access to PeerJS signaling and relay services.
- Keep the source board, QR card, and both devices awake until delivery
  completes. A transfer code expires after 10 minutes and delivers once.
- Camera permission is only required to scan a QR card inside CoLab Board. A
  phone's system camera can open a **Take board** link without app permission.
- VPNs, captive portals, and restrictive corporate or guest networks can block
  WebRTC even when normal web browsing works. Retry with the source still open,
  disable the VPN, or use another Wi-Fi or cellular network.
- Use **Download project** and move the `.colab.json` file manually when a
  network blocks live transfer.

Every transfer dialog includes a **?** with these requirements and
troubleshooting steps. Receivers wait up to 90 seconds, retry brief
sender-readiness races automatically, and report whether signaling, sender
availability, or WebRTC negotiation failed.

## Branding and themes

Brand metadata and Canvas colors live in `src/branding.ts`. CSS identity tokens
live in `src/themes.css`; application components consume semantic
`--brand-*` variables rather than theme-specific values. Add a theme definition
in both files, then expose its ID through the `BrandThemeId` type.

The Board Settings panel switches bundled themes at runtime. Theme-It creates a
custom theme entirely in the browser and can export or import a
`.colab-theme.json` pack. Theme choices, custom colors, logos, and overlay
opacity stay local unless the user explicitly exports a theme pack.
