import { useEffect, useRef, useState } from 'react'
import { ImageIcon, Scaling, SunMedium, Trash2, Undo2, X } from 'lucide-react'
import { getImageOpacity, withImageEdit } from './board'
import type { ImageItem } from './types'

const IMAGE_MIN_SIZE = 80
const IMAGE_MAX_SIZE = 2400

interface ImageInspectorProps {
  item: ImageItem
  onPreview: (item: ImageItem) => void
  onCommit: (item: ImageItem) => void
  onDelete: () => void
  onClose: () => void
}

export default function ImageInspector({
  item,
  onPreview,
  onCommit,
  onDelete,
  onClose,
}: ImageInspectorProps) {
  const [draft, setDraft] = useState(item)
  const draftRef = useRef(item)
  const dirtyRef = useRef(false)
  const aspectRatio = item.width / item.height

  useEffect(() => {
    setDraft(item)
    draftRef.current = item
    dirtyRef.current = false
  }, [item])

  const preview = (edits: Partial<Pick<ImageItem, 'opacity' | 'width' | 'height' | 'x' | 'y'>>) => {
    const next = withImageEdit(draftRef.current, edits)
    draftRef.current = next
    dirtyRef.current = true
    setDraft(next)
    onPreview(next)
  }

  const commit = () => {
    if (!dirtyRef.current) return
    dirtyRef.current = false
    onCommit(draftRef.current)
  }

  const applyAndCommit = (edits: Partial<Pick<ImageItem, 'opacity' | 'width' | 'height' | 'x' | 'y'>>) => {
    const next = withImageEdit(draftRef.current, edits)
    draftRef.current = next
    dirtyRef.current = false
    setDraft(next)
    onPreview(next)
    onCommit(next)
  }

  const handleWidthChange = (rawWidth: number) => {
    const width = Math.min(IMAGE_MAX_SIZE, Math.max(IMAGE_MIN_SIZE, rawWidth))
    const height = Math.round(width / aspectRatio)
    const cx = draftRef.current.x + draftRef.current.width / 2
    const cy = draftRef.current.y + draftRef.current.height / 2
    preview({
      width,
      height,
      x: cx - width / 2,
      y: cy - height / 2,
    })
  }

  const opacity = getImageOpacity(draft)
  const opacityPct = Math.round(opacity * 100)
  const widthPx = Math.round(draft.width)
  const heightPx = Math.round(draft.height)

  return (
    <aside className="image-inspector" aria-label="Image settings">
      <header>
        <span className="image-inspector-icon">
          <ImageIcon />
        </span>
        <span>
          <small>SELECTED IMAGE</small>
          <strong title={item.name}>{item.name}</strong>
        </span>
        <button type="button" aria-label="Close image settings" onClick={onClose}>
          <X />
        </button>
      </header>

      <div className="image-inspector-ranges">
        <label>
          <span>
            <SunMedium />
            Transparency
            <output>{opacityPct}%</output>
          </span>
          <input
            type="range"
            aria-label="Opacity"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(event) => preview({ opacity: Number(event.target.value) })}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
        </label>

        <label>
          <span>
            <Scaling />
            Width
            <output>{widthPx} px</output>
          </span>
          <input
            type="range"
            aria-label="Width (aspect-ratio locked)"
            min={IMAGE_MIN_SIZE}
            max={IMAGE_MAX_SIZE}
            step={8}
            value={widthPx}
            onChange={(event) => handleWidthChange(Number(event.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
        </label>

        <p className="image-inspector-size-hint">
          {widthPx} × {heightPx} px · aspect ratio locked
        </p>
      </div>

      <div className="image-inspector-actions">
        <button
          type="button"
          onClick={() => {
            applyAndCommit({ opacity: 1, width: item.width, height: item.height, x: item.x, y: item.y })
          }}
        >
          <Undo2 /> Reset
        </button>
        <button
          className="danger"
          type="button"
          aria-label="Delete image"
          onClick={onDelete}
        >
          <Trash2 /> Delete
        </button>
      </div>
    </aside>
  )
}
