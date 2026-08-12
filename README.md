# Ethical Tech CoLab Board

**[Open the live CoLab Board →](https://ethical-tech-colab.github.io/ethical-tech-colab-board/)**

A local-first spatial thinking surface for touch displays, classrooms, studios, and collaborative workshops. It runs entirely in the browser and can be hosted on GitHub Pages without a server.

## Current release — v0.6.2

- Pressure-aware pen and highlighter input
- Infinite pan-and-zoom canvas with mouse, touch, and pen support
- Sticky notes, images, eraser, selection, undo, and redo
- IndexedDB autosave with portable JSON project files and PNG export
- Event provenance and animated replay scoped to work after the latest clear
- Continuously moving Session Replay, Ink Drift, and CoLab Galaxy screensavers
- Collapsible right-hand board settings panel
- QR board handoff with one-use, encrypted peer-to-peer transfer
- Mobile receiving preview with Save Project and Open in CoLab Board actions
- Personal-device-to-board intake for CoLab projects and images using a short
  code or camera-scanned QR card
- Facilitator preview and explicit accept/reject before incoming content is
  placed near the current view without replacing existing work
- Installable PWA with an offline application shell
- Runtime-swappable brand themes with the Ethical Tech CoLab website identity
  active by default and the original Warm Studio identity included as a sample
- Opt-in Three.js spatial view with orbit navigation, floating object layers,
  dimensional pressure-aware ink, illuminated notes, and image panels
- Persistent spatial transforms for object depth, X/Y tilt, rotation, and scale
  with quick layer actions, reset, keyboard depth nudging, and undo/redo
- Switchable spatial grid, one-point, and two-point perspective guides

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
in both files, then expose its ID through the `BrandThemeId` type. The Board
Settings panel can switch themes at runtime, and the selection is kept locally.
