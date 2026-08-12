import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Box,
  Rotate3D,
  Scaling,
  Undo2,
  X,
} from 'lucide-react'
import {
  DEFAULT_SPATIAL_TRANSFORM,
  getSpatialTransform,
  withSpatialTransform,
} from './board'
import type { BoardItem, SpatialTransform } from './types'

interface SpatialInspectorProps {
  item: BoardItem
  onPreview: (item: BoardItem) => void
  onCommit: (item: BoardItem) => void
  onClose: () => void
}

interface TransformControl {
  key: keyof SpatialTransform
  label: string
  minimum: number
  maximum: number
  step: number
  unit: string
}

const CONTROLS: TransformControl[] = [
  {
    key: 'depth',
    label: 'Depth',
    minimum: -500,
    maximum: 500,
    step: 10,
    unit: '',
  },
  {
    key: 'rotationX',
    label: 'Tilt X',
    minimum: -70,
    maximum: 70,
    step: 1,
    unit: '°',
  },
  {
    key: 'rotationY',
    label: 'Tilt Y',
    minimum: -70,
    maximum: 70,
    step: 1,
    unit: '°',
  },
  {
    key: 'rotationZ',
    label: 'Spin',
    minimum: -180,
    maximum: 180,
    step: 1,
    unit: '°',
  },
  {
    key: 'scale',
    label: 'Scale',
    minimum: 0.4,
    maximum: 2.4,
    step: 0.05,
    unit: '×',
  },
]

export default function SpatialInspector({
  item,
  onPreview,
  onCommit,
  onClose,
}: SpatialInspectorProps) {
  const [draft, setDraft] = useState(item)
  const draftRef = useRef(item)
  const dirtyRef = useRef(false)

  useEffect(() => {
    setDraft(item)
    draftRef.current = item
    dirtyRef.current = false
  }, [item])

  const preview = (values: Partial<SpatialTransform>) => {
    const next = withSpatialTransform(draftRef.current, values)
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

  const applyAndCommit = (values: Partial<SpatialTransform>) => {
    const next = withSpatialTransform(draftRef.current, values)
    draftRef.current = next
    dirtyRef.current = false
    setDraft(next)
    onPreview(next)
    onCommit(next)
  }

  const transform = getSpatialTransform(draft)

  return (
    <aside className="spatial-inspector" aria-label="Spatial transform">
      <header>
        <span className="spatial-inspector-icon">
          <Box />
        </span>
        <span>
          <small>SPATIAL OBJECT</small>
          <strong>
            {item.type === 'stroke'
              ? 'Dimensional ink'
              : item.type === 'note'
                ? 'Thought card'
                : item.name}
          </strong>
        </span>
        <button type="button" aria-label="Close spatial controls" onClick={onClose}>
          <X />
        </button>
      </header>

      <div className="spatial-layer-actions">
        <button
          type="button"
          onClick={() => applyAndCommit({ depth: transform.depth - 80 })}
        >
          <ArrowDownToLine /> Send back
        </button>
        <button
          type="button"
          onClick={() => applyAndCommit({ depth: transform.depth + 80 })}
        >
          <ArrowUpToLine /> Bring forward
        </button>
      </div>

      <div className="spatial-ranges">
        {CONTROLS.map((control) => (
          <label key={control.key}>
            <span>
              {control.key === 'scale' ? <Scaling /> : <Rotate3D />}
              {control.label}
              <output>
                {control.key === 'scale'
                  ? transform[control.key].toFixed(2)
                  : Math.round(transform[control.key])}
                {control.unit}
              </output>
            </span>
            <input
              type="range"
              aria-label={control.label}
              min={control.minimum}
              max={control.maximum}
              step={control.step}
              value={transform[control.key]}
              onChange={(event) =>
                preview({ [control.key]: Number(event.target.value) })
              }
              onPointerUp={commit}
              onKeyUp={commit}
              onBlur={commit}
            />
          </label>
        ))}
      </div>

      <button
        className="spatial-reset"
        type="button"
        onClick={() => applyAndCommit(DEFAULT_SPATIAL_TRANSFORM)}
      >
        <Undo2 /> Reset spatial transform
      </button>
      <p>
        Tip: use <kbd>[</kbd> and <kbd>]</kbd> to move the selected object
        through depth.
      </p>
    </aside>
  )
}
