import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Pause, Play, RotateCcw, X } from 'lucide-react'
import { getReplayDuration, replayAt } from './board'
import type { BrandTheme } from './branding'
import { drawScene, type ImageCache } from './render'
import type { BoardDocument, ScreensaverMode } from './types'

interface ReplayOverlayProps {
  document: BoardDocument
  mode: ScreensaverMode
  autoLoop: boolean
  theme: BrandTheme
  onClose: () => void
}

export default function ReplayOverlay({
  document,
  mode,
  autoLoop,
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
  const [speed, setSpeed] = useState(autoLoop ? 2 : 1)
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight })
  const [imageRevision, setImageRevision] = useState(0)

  const sourceDuration = getReplayDuration(document.timeline)
  const playbackDuration = Math.min(90_000, Math.max(6_000, sourceDuration))
  const fadeDuration = autoLoop ? 1800 : 0
  const totalDuration = playbackDuration + fadeDuration

  const sceneItems = useMemo(
    () => document.items.slice(0, 42),
    [document.items],
  )

  useLayoutEffect(() => {
    const resize = () => setSize({ width: innerWidth, height: innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (mode !== 'replay') return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = size.width * dpr
    canvas.height = size.height * dpr
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const sourceElapsed =
      sourceDuration === 0
        ? 0
        : Math.min(1, elapsed / playbackDuration) * sourceDuration
    const frame =
      document.timeline.length > 0
        ? replayAt(document.timeline, sourceElapsed)
        : { items: document.items, camera: { x: 0, y: 0, scale: 1 } }
    drawScene(
      context,
      size.width,
      size.height,
      frame.items,
      frame.camera,
      imageCache.current,
      {
        notes: true,
        watermark: document.watermark,
        theme: theme.canvas,
        onImageLoad: () => setImageRevision((value) => value + 1),
      },
    )
  }, [
    document.items,
    document.timeline,
    document.watermark,
    elapsed,
    imageRevision,
    mode,
    playbackDuration,
    size,
    sourceDuration,
    theme.canvas,
  ])

  useEffect(() => {
    if (!playing || mode !== 'replay') return
    const animate = (time: number) => {
      if (lastFrame.current === undefined) lastFrame.current = time
      const delta = time - lastFrame.current
      lastFrame.current = time
      let next = elapsedRef.current + delta * speed
      if (next >= totalDuration) {
        if (autoLoop) {
          next = 0
        } else {
          next = playbackDuration
          setPlaying(false)
        }
      }
      elapsedRef.current = next
      setElapsed(next)
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
      lastFrame.current = undefined
    }
  }, [autoLoop, mode, playbackDuration, playing, speed, totalDuration])

  useEffect(() => {
    const closeOnInput = () => {
      if (autoLoop) onClose()
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

  const fade =
    elapsed > playbackDuration
      ? Math.max(0, 1 - (elapsed - playbackDuration) / fadeDuration)
      : 1

  return (
    <section
      className={`replay-overlay mode-${mode}`}
      aria-label={`${mode} screensaver`}
    >
      {mode === 'replay' ? (
        <canvas ref={canvasRef} style={{ opacity: fade }} />
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
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ) : (
        <div className="galaxy-scene">
          <div className="galaxy-core">
            <span>ETHICAL TECH</span>
            <strong>CoLab</strong>
          </div>
          {sceneItems.map((item, index) => (
            <i
              key={item.id}
              style={{ '--i': index } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      <header className="replay-header">
        <div className="brand-mark small" aria-hidden="true">
          {theme.logoSrc ? <img src={theme.logoSrc} alt="" /> : theme.mark}
        </div>
        <div>
          <span>{autoLoop ? 'Idle canvas' : 'Session replay'}</span>
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
