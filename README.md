# Ethical Tech CoLab Board

**[Open the live CoLab Board →](https://ethical-tech-colab.github.io/ethical-tech-colab-board/)**

A local-first spatial thinking surface for touch displays, classrooms, studios, and collaborative workshops. It runs entirely in the browser and can be hosted on GitHub Pages without a server.

## Current release — v0.12.0

- Pressure-aware pen and highlighter input with Surface Pen rear-eraser and
  barrel-button canvas movement
- Surface-style touch input: one finger grabs the complete canvas, two fingers
  pinch, and a stylus draws; Settings can switch finger input back to drawing
- Infinite pan-and-zoom canvas with mouse, touch, and pen support
- Sticky notes, images, eraser, selection, undo, and redo
- IndexedDB autosave with portable JSON project files and PNG export
- Branded PNG exports with a visible live-site link and scannable return QR code
- Event provenance and animated replay scoped to work after the latest clear
- Replay Studio with Exact, Accelerated, Artistic Camera, Ghost Trails, and
  Infinite Evolution treatments plus six selectable ending effects
- Continuously moving Session Replay, Ink Drift, CoLab Galaxy, Aurora Flow, and
  Idea Constellation screensavers
- WarGames Terminal, faithfully adapted from the Ethical Tech CoLab
  [War-Games](https://github.com/Ethical-Tech-CoLab/War-Games) design system,
  and a moving Retro Snake screensaver
- Idle detection covers the full application and stays suspended while modal
  transfer, help, or Theme-It workflows are open
- Collapsible right-hand board settings panel
- Full-viewport responsive layouts for compact landscape, tablet portrait, and
  portrait-oriented shared displays
- One global, persisted glass-overlay opacity control with a quick reset; the
  canvas remains visibly present beneath desktop tools and Settings
- QR board handoff with one-use, encrypted peer-to-peer transfer
- Mobile receiving preview with Save Project and Open in CoLab Board actions
- Personal-device-to-board intake for CoLab projects and images using a short
  code or camera-scanned QR card
- Explicitly opt-in live peer boards with host/join codes, encrypted WebRTC
  transport, initial host snapshot, connection status, and local-only default
- Facilitator preview and explicit accept/reject before incoming content is
  placed near the current view without replacing existing work
- Installable PWA with an offline application shell
- Runtime-swappable brand themes with the Ethical Tech CoLab website identity
  active by default, plus Warm Studio, Signal Lab, Civic Ocean, and Sunrise
  Commons packs
- Local Theme-It wizard with uploaded-reference and screen color sampling,
  primary/accent/canvas/surface controls, local logo support, automatic contrast
  derivation, live preview, persistence, and portable theme pack import/export
- Dense Surface-inspired rainbow glitter ink with smooth color travel and
  deterministic micro-sparkles across drawing, autosave, replay, PNG rendering,
  and the Three.js spatial view
- Opt-in Three.js spatial view with orbit navigation, floating object layers,
  dimensional pressure-aware ink, illuminated notes, and image panels
- Persistent spatial transforms for object depth, X/Y tilt, rotation, and scale
  with quick layer actions, reset, keyboard depth nudging, and undo/redo
- Switchable spatial grid, one-point, and two-point perspective guides
- Browser-native Surface Dial/wheel preference for canvas zoom or ink-size
  adjustment, with Ctrl-wheel zoom retained in ink-size mode
- Streamlined header actions with media insertion kept in the left tool rail
- Smooth replay fade-out at the end of manual and idle Session Replay

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

Live boards use the same signaling and encrypted peer transport. They exchange
complete board snapshots only while users explicitly keep a session active.
This first collaboration mode is intentionally lightweight: the latest received
snapshot wins, so simultaneous conflicting edits can replace one another.

### QR transfer requirements

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
