# Ethical Tech CoLab Board

**[Open the live CoLab Board →](https://ethical-tech-colab.github.io/ethical-tech-colab-board/)**

A local-first spatial thinking surface for touch displays, classrooms, studios, and collaborative workshops. It runs entirely in the browser and can be hosted on GitHub Pages without a server.

## Current release — v0.9.1

- Pressure-aware pen and highlighter input
- Infinite pan-and-zoom canvas with mouse, touch, and pen support
- Sticky notes, images, eraser, selection, undo, and redo
- IndexedDB autosave with portable JSON project files and PNG export
- Event provenance and animated replay scoped to work after the latest clear
- Continuously moving Session Replay, Ink Drift, CoLab Galaxy, Aurora Flow, and
  Idea Constellation screensavers
- Collapsible right-hand board settings panel
- Full-viewport responsive layouts for compact landscape, tablet portrait, and
  portrait-oriented shared displays
- One global, persisted glass-overlay opacity control with a quick reset; the
  canvas remains visibly present beneath desktop tools and Settings
- QR board handoff with one-use, encrypted peer-to-peer transfer
- Mobile receiving preview with Save Project and Open in CoLab Board actions
- Personal-device-to-board intake for CoLab projects and images using a short
  code or camera-scanned QR card
- Facilitator preview and explicit accept/reject before incoming content is
  placed near the current view without replacing existing work
- Installable PWA with an offline application shell
- Runtime-swappable brand themes with the Ethical Tech CoLab website identity
  active by default, plus Warm Studio, Signal Lab, Civic Ocean, and Sunrise
  Commons packs
- Local Theme-It wizard with uploaded-reference and screen color sampling,
  primary/accent/canvas/surface controls, local logo support, automatic contrast
  derivation, live preview, persistence, and portable theme pack import/export
- Deterministic sparkly multicolor ink across drawing, autosave, replay, PNG
  rendering, and the Three.js spatial view
- Opt-in Three.js spatial view with orbit navigation, floating object layers,
  dimensional pressure-aware ink, illuminated notes, and image panels
- Persistent spatial transforms for object depth, X/Y tilt, rotation, and scale
  with quick layer actions, reset, keyboard depth nudging, and undo/redo
- Switchable spatial grid, one-point, and two-point perspective guides
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

## Branding and themes

Brand metadata and Canvas colors live in `src/branding.ts`. CSS identity tokens
live in `src/themes.css`; application components consume semantic
`--brand-*` variables rather than theme-specific values. Add a theme definition
in both files, then expose its ID through the `BrandThemeId` type.

The Board Settings panel switches bundled themes at runtime. Theme-It creates a
custom theme entirely in the browser and can export or import a
`.colab-theme.json` pack. Theme choices, custom colors, logos, and overlay
opacity stay local unless the user explicitly exports a theme pack.
