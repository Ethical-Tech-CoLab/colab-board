import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Pause, Play, RotateCcw, X } from 'lucide-react'
import {
  getAmbientReplayCamera,
  getReplayFade,
  getReplayDuration,
  getReplayTimelineSinceLastClear,
  replayAt,
} from './board'
import type { BrandTheme } from './branding'
import { drawScene, type ImageCache } from './render'
import WaterScreensaver from './WaterScreensaver'
import type {
  BoardDocument,
  Camera,
  ReplayEndEffect,
  ReplayStyle,
  SceneMode,
  ScreensaverMode,
} from './types'

interface ReplayOverlayProps {
  document: BoardDocument
  camera: Camera
  sceneMode: SceneMode
  mode: ScreensaverMode
  autoLoop: boolean
  replayStyle: ReplayStyle
  endEffect: ReplayEndEffect
  theme: BrandTheme
  onClose: () => void
}

export default function ReplayOverlay({
  document,
  camera,
  sceneMode,
  mode,
  autoLoop,
  replayStyle,
  endEffect,
  theme,
  onClose,
}: ReplayOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageCache = useRef<ImageCache>(new Map())
  const frameRef = useRef<number | undefined>(undefined)
  const lastFrame = useRef<number | undefined>(undefined)
  const elapsedRef = useRef(0)
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(
    replayStyle === 'accelerated'
      ? 4
      : autoLoop && replayStyle !== 'exact' && replayStyle !== 'evolution'
        ? 2
        : 1,
  )
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight })
  const [imageRevision, setImageRevision] = useState(0)

  const replayTimeline = useMemo(
    () => getReplayTimelineSinceLastClear(document.timeline),
    [document.timeline],
  )

  // Pre-sort once so replayAt can skip its internal O(n log n) sort every frame.
  const sortedTimeline = useMemo(
    () => [...replayTimeline].sort((a, b) => a.at - b.at),
    [replayTimeline],
  )

  const sourceDuration = getReplayDuration(replayTimeline)
  const playbackDuration = Math.min(90_000, Math.max(6_000, sourceDuration))
  const fadeDuration = autoLoop ? 1800 : 1200
  const totalDuration = playbackDuration + fadeDuration

  const sceneItems = useMemo(
    () => document.items.slice(0, 42),
    [document.items],
  )

  // True while the overlay is open; set to false in the exit handler to gate
  // any rAF callback that fires between the input event and React's unmount.
  const activeRef = useRef(true)

  // Stable reference to the current draw function. Updated via useLayoutEffect
  // so the animation loop can draw directly without going through React state.
  const drawRef = useRef<(elapsedMs: number) => void>(() => {})

  useLayoutEffect(() => {
    if (mode !== 'replay') return
    drawRef.current = (elapsedMs: number) => {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return

      const sourceElapsed =
        sourceDuration === 0
          ? 0
          : Math.min(1, elapsedMs / playbackDuration) * sourceDuration
      const frame =
        sortedTimeline.length > 0
          ? replayAt(sortedTimeline, sourceElapsed, camera, true)
          : {
              items: document.timeline.length === 0 ? document.items : [],
              camera,
            }
      const replayCamera =
        replayStyle === 'artistic' || replayStyle === 'evolution'
          ? getAmbientReplayCamera(frame.camera, elapsedMs, size)
          : frame.camera
      drawScene(
        context,
        size.width,
        size.height,
        frame.items,
        replayCamera,
        imageCache.current,
        {
          notes: true,
          watermark: document.watermark,
          theme: theme.canvas,
          onImageLoad: () => setImageRevision((value) => value + 1),
        },
      )
      if (replayStyle === 'ghosts' && sortedTimeline.length > 0) {
        for (const [offset, alpha] of [
          [sourceDuration * 0.025, 0.13],
          [sourceDuration * 0.05, 0.07],
        ] as const) {
          const ghost = replayAt(
            sortedTimeline,
            Math.max(0, sourceElapsed - offset),
            camera,
            true,
          )
          context.save()
          context.globalAlpha = alpha
          context.filter = 'blur(0.6px) saturate(1.35)'
          drawScene(
            context,
            size.width,
            size.height,
            ghost.items,
            replayCamera,
            imageCache.current,
            {
              clear: false,
              background: false,
              grid: false,
              notes: true,
              theme: theme.canvas,
            },
          )
          context.restore()
        }
      }
    }
  }, [
    camera,
    document.items,
    document.timeline.length,
    document.watermark,
    mode,
    playbackDuration,
    replayStyle,
    size,
    sortedTimeline,
    sourceDuration,
    theme.canvas,
    imageRevision,
  ])

  useLayoutEffect(() => {
    const resize = () => setSize({ width: innerWidth, height: innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Resize the canvas backing store only when viewport size changes.
  // Setting canvas.width allocates a new backing store; doing it every frame
  // causes unnecessary GC pressure and frame jank.
  useEffect(() => {
    if (mode !== 'replay') return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = size.width * dpr
    canvas.height = size.height * dpr
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    const context = canvas.getContext('2d')
    if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [mode, size])

  // Redraw when non-elapsed dependencies change (replayStyle, image loads, resize).
  useEffect(() => {
    if (mode !== 'replay') return
    drawRef.current(elapsedRef.current)
  }, [mode, sortedTimeline, replayStyle, imageRevision, size])

  // Animation loop — draws directly via drawRef to keep React off the hot path.
  // For autoLoop (screensaver) we skip setElapsed while the canvas is animating
  // (fade is always 1 during playback) and only update state when the fade begins
  // so the CSS --replay-fade variable tracks correctly.
  useEffect(() => {
    if (!playing || mode !== 'replay') return
    const animate = (time: number) => {
      // Exit was requested; do not schedule another frame.
      if (!activeRef.current) return
      if (lastFrame.current === undefined) lastFrame.current = time
      const delta = time - lastFrame.current
      lastFrame.current = time
      let next = elapsedRef.current + delta * speed
      if (next >= totalDuration) {
        if (autoLoop) {
          next = 0
        } else {
          next = totalDuration
          setPlaying(false)
        }
      }
      elapsedRef.current = next

      // Draw the frame directly — no React state update, no re-render.
      drawRef.current(next)

      // Update React state only when needed:
      // - In non-autoLoop (Replay Studio): always, for the smooth progress bar.
      // - In autoLoop (screensaver): only during the fade phase at end of cycle,
      //   so the CSS --replay-fade variable is kept accurate.
      if (!autoLoop || next > playbackDuration) {
        setElapsed(next)
      }

      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
      lastFrame.current = undefined
    }
  }, [autoLoop, mode, playbackDuration, playing, speed, totalDuration])

  // Exit handler. Runs synchronously on user input: cancels the pending rAF
  // and gates the loop via activeRef before calling onClose so no stale frame
  // can fire between the event and React's unmount commit.
  useEffect(() => {
    const closeOnInput = () => {
      if (!autoLoop) return
      activeRef.current = false
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = undefined
      }
      onClose()
    }
    window.addEventListener('pointerdown', closeOnInput)
    window.addEventListener('keydown', closeOnInput)
    return () => {
      window.removeEventListener('pointerdown', closeOnInput)
      window.removeEventListener('keydown', closeOnInput)
    }
  }, [autoLoop, onClose])

  const reset = () => {
    elapsedRef.current = 0
    setElapsed(0)
    setPlaying(true)
  }

  const fade = getReplayFade(elapsed, playbackDuration, fadeDuration)
  const ending = elapsed > playbackDuration
  const replayLabel =
    replayStyle === 'ghosts'
      ? 'Ghost trails'
      : replayStyle === 'evolution'
        ? 'Infinite evolution'
        : `${replayStyle} replay`

  return (
    <section
      className={`replay-overlay mode-${mode} style-${replayStyle} end-${endEffect} scene-${sceneMode}${
        ending ? ' is-ending' : ''
      }`}
      aria-label={`${mode} screensaver`}
      style={{ '--replay-fade': fade } as React.CSSProperties}
    >
      {mode === 'replay' ? (
        <>
          <canvas ref={canvasRef} />
          <div className="replay-end-layer" aria-hidden="true" />
        </>
      ) : mode === 'drift' ? (
        <div className="drift-scene">
          <div className="drift-title">{document.title}</div>
          {sceneItems.map((item, index) => (
            <span
              key={item.id}
              style={
                {
                  '--i': index,
                  '--tone':
                    item.type === 'stroke'
                      ? item.color
                      : item.type === 'note'
                        ? item.color
                        : '#8eb6a7',
                  '--x': `${5 + ((index * 29) % 84)}%`,
                  '--y': `${8 + ((index * 23) % 76)}%`,
                  '--width': `${45 + (index % 5) * 24}px`,
                  '--height': `${45 + (index % 4) * 30}px`,
                  '--blur': `${(index % 3) * 2}px`,
                  '--duration': `${12 + (index % 7) * 2}s`,
                  '--delay': `${index * -0.7}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ) : mode === 'galaxy' ? (
        <div className="galaxy-scene">
          <div className="galaxy-core">
            <span>ETHICAL TECH</span>
            <strong>CoLab</strong>
          </div>
          {sceneItems.map((item, index) => (
            <i
              key={item.id}
              style={
                {
                  '--i': index,
                  '--size': `${2 + (index % 4)}px`,
                  '--duration': `${9 + (index % 8) * 2}s`,
                  '--radius': `${45 + index * 10}px`,
                  '--delay': `${index * -0.5}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ) : mode === 'aurora' ? (
        <div className="aurora-scene">
          <div className="aurora-title">
            <span>Ideas in motion</span>
            <strong>{document.title}</strong>
          </div>
          {Array.from({ length: 6 }, (_, index) => (
            <i key={index} style={{ '--i': index } as React.CSSProperties} />
          ))}
          <div className="aurora-stars" />
        </div>
      ) : mode === 'constellation' ? (
        <div className="constellation-scene">
          <div className="constellation-title">
            <span>Connected thinking</span>
            <strong>{document.title}</strong>
          </div>
          <svg viewBox="0 0 1000 700" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => {
              const next = (index + 5) % 18
              return (
                <line
                  key={`line-${index}`}
                  x1={90 + ((index * 137) % 820)}
                  y1={80 + ((index * 89) % 540)}
                  x2={90 + ((next * 137) % 820)}
                  y2={80 + ((next * 89) % 540)}
                />
              )
            })}
          </svg>
          {Array.from({ length: 18 }, (_, index) => (
            <i
              key={index}
              style={
                {
                  '--i': index,
                  '--x': `${9 + ((index * 13.7) % 82)}%`,
                  '--y': `${11 + ((index * 8.9) % 77)}%`,
                  '--size': `${5 + (index % 4) * 2}px`,
                  '--duration': `${4 + (index % 5) * 1.2}s`,
                  '--delay': `${index * -0.34}s`,
                  '--dx': `${-18 + (index % 5) * 9}px`,
                  '--dy': `${24 - (index % 4) * 13}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ) : mode === 'terminal' ? (
        <div className="wargames-scene">
          <div className="wg-monitor">
            <div className="wg-crt">
              <div className="wg-statusbar">
                <div className="wg-defcon">
                  <span>DEFCON</span>
                  <strong>5</strong>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <span>WOPR // COLAB SIMULATION</span>
              </div>
              <div className="wg-terminal">
                <div className="wg-output">
                  {[
                    'WOPR SYSTEM ONLINE',
                    `SESSION ${document.id.slice(-8).toUpperCase()}`,
                    `OBJECTS ${document.items.length.toString().padStart(3, '0')}  EVENTS ${document.timeline.length.toString().padStart(3, '0')}`,
                    'ANALYZING HUMAN / TECHNOLOGY SYSTEMS',
                    'SEARCHING FOR ETHICAL PATHWAYS',
                    'SHALL WE PLAY A GAME?',
                  ].map((line, index) => (
                    <span
                      key={line}
                      className={index === 5 ? 'is-system' : ''}
                      style={{ '--i': index } as React.CSSProperties}
                    >
                      {line}
                    </span>
                  ))}
                </div>
                <div className="wg-prompt">
                  <span>&gt;</span>
                  <i />
                </div>
              </div>
              <div className="wg-refresh" aria-hidden="true" />
              <div className="wg-flicker" aria-hidden="true" />
              <div className="wg-scanlines" aria-hidden="true" />
            </div>
            <div className="wg-monitor-chin">
              <span>WOPR // ETC LABS</span>
              <i />
            </div>
          </div>
        </div>
      ) : mode === 'water' ? (
        <WaterScreensaver document={document} theme={theme} onClose={onClose} />
      ) : (
        <div className="snake-scene">
          <div className="snake-title">
            <span>COLAB ARCADE</span>
            <strong>IDEA SNAKE</strong>
            <small>{document.items.length} ideas collected</small>
          </div>
          <svg viewBox="0 0 1000 700" aria-hidden="true">
            <path
              className="snake-track"
              d="M90 190H820V520H210V330H690V420H370V270H910"
            />
            <path
              className="snake-body"
              d="M90 190H820V520H210V330H690V420H370V270H910"
            />
            {Array.from({ length: 9 }, (_, index) => (
              <circle
                key={index}
                className="snake-food"
                cx={130 + ((index * 193) % 760)}
                cy={120 + ((index * 137) % 480)}
                r={7 + (index % 2) * 3}
                style={{ '--i': index } as React.CSSProperties}
              />
            ))}
          </svg>
          <div className="snake-score">SCORE {document.timeline.length * 10}</div>
        </div>
      )}

      <header className="replay-header">
        <div className="brand-mark small" aria-hidden="true">
          {theme.logoSrc ? <img src={theme.logoSrc} alt="" /> : theme.mark}
        </div>
        <div>
          <span>
            {mode === 'replay'
              ? autoLoop
                ? replayLabel
                : `Replay Studio · ${replayLabel}`
              : mode === 'water'
                ? 'Water surface'
                : 'Idle canvas'}
          </span>
          <strong>{document.title}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Exit replay">
          <X />
        </button>
      </header>

      {mode === 'replay' && !autoLoop && (
        <div className="replay-controls">
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <button type="button" onClick={reset} aria-label="Restart replay">
            <RotateCcw />
          </button>
          <input
            type="range"
            min="0"
            max={playbackDuration}
            value={Math.min(elapsed, playbackDuration)}
            aria-label="Replay timeline"
            onChange={(event) => {
              const value = Number(event.target.value)
              elapsedRef.current = value
              setElapsed(value)
            }}
          />
          <select
            value={speed}
            aria-label="Replay speed"
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
          </select>
        </div>
      )}

      {autoLoop && (
        <div className="wake-hint">Touch anywhere to return to the board</div>
      )}
    </section>
  )
}
