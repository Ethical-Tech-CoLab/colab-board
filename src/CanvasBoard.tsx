import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { GripHorizontal, X } from 'lucide-react'
import {
  cloneItem,
  createNote,
  hitTest,
  strokeAsEvent,
} from './board'
import type { CanvasBrandTokens } from './branding'
import { NOTE_SURFACE_OPACITY_PERCENT } from './noteAppearance'
import { drawScene, type ImageCache } from './render'
import {
  getPenButtonAction,
  getPointerPressure,
} from './surfacePointer'
import type {
  BoardDocument,
  BoardItem,
  Camera,
  DialMode,
  ImageItem,
  InkStyle,
  NoteItem,
  Point,
  StrokeItem,
  Tool,
} from './types'

interface CanvasBoardProps {
  document: BoardDocument
  camera: Camera
  tool: Tool
  color: string
  strokeWidth: number
  inkStyle: InkStyle
  canvasTheme: CanvasBrandTokens
  noteColor: string
  touchMode: 'pan' | 'draw'
  dialMode: DialMode
  selectedId: string | null
  remoteDrafts: StrokeItem[]
  imageInspectorPreview?: ImageItem | null
  onAddItem: (item: BoardItem, eventAt?: number) => void
  onUpdateItem: (item: BoardItem) => void
  onDeleteItem: (id: string) => void
  onCameraChange: (camera: Camera) => void
  onCameraSettled: (camera: Camera) => void
  onSelectionChange: (id: string | null) => void
  onFilesDropped: (files: FileList, point: { x: number; y: number }) => void
  onStrokeWidthDelta: (delta: number) => void
  onActivity: () => void
  onDraftChange: (
    draft: StrokeItem | null,
    reason?: 'end' | 'cancel',
  ) => void
}

interface CanvasSize {
  width: number
  height: number
  dpr: number
}

interface EditableNoteProps {
  item: NoteItem
  camera: Camera
  selected: boolean
  active: boolean
  onSelect: () => void
  onUpdate: (item: NoteItem) => void
  onDelete: () => void
  onActivity: () => void
}

function clampScale(scale: number) {
  return Math.min(4, Math.max(0.2, scale))
}

function EditableNote({
  item,
  camera,
  selected,
  active,
  onSelect,
  onUpdate,
  onDelete,
  onActivity,
}: EditableNoteProps) {
  const [text, setText] = useState(item.text)
  const [position, setPosition] = useState({ x: item.x, y: item.y })
  const drag = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  useEffect(() => setText(item.text), [item.text])
  useEffect(() => setPosition({ x: item.x, y: item.y }), [item.x, item.y])

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!active) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    }
    onSelect()
    onActivity()
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    setPosition({
      x:
        drag.current.originX +
        (event.clientX - drag.current.startX) / camera.scale,
      y:
        drag.current.originY +
        (event.clientY - drag.current.startY) / camera.scale,
    })
  }

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    drag.current = null
    if (position.x !== item.x || position.y !== item.y) {
      onUpdate({ ...item, ...position })
    }
  }

  return (
    <article
      className={`sticky-note${selected ? ' is-selected' : ''}`}
      style={{
        width: item.width,
        height: item.height,
        '--note-color': item.color,
        '--note-surface-opacity': NOTE_SURFACE_OPACITY_PERCENT,
        transform: `translate(${position.x * camera.scale + camera.x}px, ${position.y * camera.scale + camera.y}px) scale(${camera.scale})`,
        pointerEvents: active ? 'auto' : 'none',
      } as CSSProperties}
      onPointerDown={(event) => {
        event.stopPropagation()
        onSelect()
        onActivity()
      }}
    >
      <div
        className="note-grip"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <GripHorizontal size={18} aria-hidden="true" />
        <button
          type="button"
          aria-label="Delete note"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <X size={14} />
        </button>
      </div>
      <textarea
        value={text}
        aria-label="Sticky note text"
        placeholder="Add a thought..."
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text !== item.text) onUpdate({ ...item, text })
        }}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </article>
  )
}

export default function CanvasBoard({
  document,
  camera,
  tool,
  color,
  strokeWidth,
  inkStyle,
  canvasTheme,
  noteColor,
  touchMode,
  dialMode,
  selectedId,
  remoteDrafts,
  imageInspectorPreview,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onCameraChange,
  onCameraSettled,
  onSelectionChange,
  onFilesDropped,
  onStrokeWidthDelta,
  onActivity,
  onDraftChange,
}: CanvasBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageCache = useRef<ImageCache>(new Map())
  const cameraRef = useRef(camera)
  const [size, setSize] = useState<CanvasSize>({ width: 1, height: 1, dpr: 1 })
  const [draft, setDraft] = useState<StrokeItem | null>(null)
  const draftRef = useRef<StrokeItem | null>(null)
  const [previewItem, setPreviewItem] = useState<ImageItem | null>(null)
  const [imageRevision, setImageRevision] = useState(0)
  const [spacePressed, setSpacePressed] = useState(false)
  const pointers = useRef(
    new Map<number, { x: number; y: number; pointerType: string }>(),
  )
  const drawInteraction = useRef<{
    pointerId: number
    startedAt: number
    startedPerformance: number
    points: Point[]
    seed: number
  } | null>(null)
  const panInteraction = useRef<{
    pointerId: number
    startX: number
    startY: number
    camera: Camera
  } | null>(null)
  const dragInteraction = useRef<{
    pointerId: number
    item: ImageItem
    startWorldX: number
    startWorldY: number
  } | null>(null)
  const gesture = useRef<{
    distance: number
    worldX: number
    worldY: number
  } | null>(null)

  useEffect(
    () => () => {
      draftRef.current = null
      onDraftChange(null, 'cancel')
    },
    [onDraftChange],
  )
  const eraseInteraction = useRef<number | null>(null)
  const erasedIds = useRef(new Set<string>())
  const wheelTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat) setSpacePressed(true)
    }
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false)
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
    }
  }, [])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const resize = () => {
      const bounds = container.getBoundingClientRect()
      setSize({
        width: bounds.width,
        height: bounds.height,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = Math.round(size.width * size.dpr)
    canvas.height = Math.round(size.height * size.dpr)
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
  }, [size])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    const items = previewItem
      ? document.items.map((item) =>
          item.id === previewItem.id ? previewItem : item,
        )
      : imageInspectorPreview
        ? document.items.map((item) =>
            item.id === imageInspectorPreview.id ? imageInspectorPreview : item,
          )
        : document.items
    drawScene(
      context,
      size.width,
      size.height,
      draft
        ? [...items, ...remoteDrafts, draft]
        : [...items, ...remoteDrafts],
      camera,
      imageCache.current,
      {
        notes: false,
        selectedId,
        watermark: document.watermark,
        theme: canvasTheme,
        onImageLoad: () => setImageRevision((value) => value + 1),
      },
    )
  }, [
    camera,
    canvasTheme,
    document.items,
    document.watermark,
    draft,
    imageInspectorPreview,
    imageRevision,
    previewItem,
    remoteDrafts,
    selectedId,
    size,
  ])

  const pointFromClient = (clientX: number, clientY: number) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    const currentCamera = cameraRef.current
    return {
      x: (clientX - (bounds?.left ?? 0) - currentCamera.x) / currentCamera.scale,
      y: (clientY - (bounds?.top ?? 0) - currentCamera.y) / currentCamera.scale,
    }
  }

  const beginGesture = () => {
    const touches = [...pointers.current.values()].filter(
      (pointer) => pointer.pointerType === 'touch',
    )
    if (touches.length !== 2) return
    const [first, second] = touches
    const bounds = containerRef.current?.getBoundingClientRect()
    const middleX = (first.x + second.x) / 2 - (bounds?.left ?? 0)
    const middleY = (first.y + second.y) / 2 - (bounds?.top ?? 0)
    const currentCamera = cameraRef.current
    gesture.current = {
      distance: Math.hypot(first.x - second.x, first.y - second.y),
      worldX: (middleX - currentCamera.x) / currentCamera.scale,
      worldY: (middleY - currentCamera.y) / currentCamera.scale,
    }
    drawInteraction.current = null
    draftRef.current = null
    setDraft(null)
    onDraftChange(null, 'cancel')
  }

  const eraseAt = (x: number, y: number) => {
    const hit = hitTest(
      document.items,
      x,
      y,
      Math.max(12, strokeWidth * 1.8) / cameraRef.current.scale,
    )
    if (hit && !erasedIds.current.has(hit.id)) {
      erasedIds.current.add(hit.id)
      onDeleteItem(hit.id)
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    onActivity()
    const penAction = getPenButtonAction(event)
    if (event.pointerType === 'pen' && penAction === 'none') return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
    })
    const touchCount = [...pointers.current.values()].filter(
      (pointer) => pointer.pointerType === 'touch',
    ).length
    if (touchCount === 2) {
      beginGesture()
      return
    }

    const point = pointFromClient(event.clientX, event.clientY)
    if (penAction === 'eraser') {
      eraseInteraction.current = event.pointerId
      erasedIds.current.clear()
      eraseAt(point.x, point.y)
      return
    }
    const shouldPan =
      tool === 'pan' ||
      spacePressed ||
      event.button === 1 ||
      event.button === 2 ||
      penAction === 'barrel' ||
      (event.pointerType === 'touch' && touchMode === 'pan')

    if (shouldPan) {
      panInteraction.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        camera: cameraRef.current,
      }
      return
    }

    if (tool === 'pen' || tool === 'highlighter') {
      const now = Date.now()
      const startedPerformance = performance.now()
      const firstPoint = {
        ...point,
        pressure: getPointerPressure(event),
        t: 0,
      }
      drawInteraction.current = {
        pointerId: event.pointerId,
        startedAt: now,
        startedPerformance,
        points: [firstPoint],
        seed: Math.floor(Math.random() * 0xffffffff),
      }
      const nextDraft: StrokeItem = {
        id: crypto.randomUUID(),
        type: 'stroke',
        points: [firstPoint],
        color,
        width: tool === 'highlighter' ? strokeWidth * 2.2 : strokeWidth,
        opacity: tool === 'highlighter' ? 0.28 : 1,
        duration: 0,
        createdAt: now,
        effect: inkStyle === 'sparkle' ? 'sparkle' : undefined,
        seed:
          inkStyle === 'sparkle'
            ? drawInteraction.current.seed
            : undefined,
      }
      draftRef.current = nextDraft
      setDraft(nextDraft)
      onDraftChange(nextDraft)
      return
    }

    if (tool === 'note') {
      const note = createNote(point.x - 20, point.y - 20, noteColor)
      onAddItem(note)
      onSelectionChange(note.id)
      return
    }

    if (tool === 'eraser') {
      eraseInteraction.current = event.pointerId
      erasedIds.current.clear()
      eraseAt(point.x, point.y)
      return
    }

    const hit = hitTest(document.items, point.x, point.y, 8 / camera.scale)
    onSelectionChange(hit?.id ?? null)
    if (hit?.type === 'image') {
      dragInteraction.current = {
        pointerId: event.pointerId,
        item: cloneItem(hit),
        startWorldX: point.x,
        startWorldY: point.y,
      }
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
    })
    onActivity()

    if (gesture.current && pointers.current.size >= 2) {
      const [first, second] = [...pointers.current.values()].filter(
        (pointer) => pointer.pointerType === 'touch',
      )
      if (!first || !second) return
      const bounds = containerRef.current?.getBoundingClientRect()
      const middleX = (first.x + second.x) / 2 - (bounds?.left ?? 0)
      const middleY = (first.y + second.y) / 2 - (bounds?.top ?? 0)
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      const scale = clampScale(
        cameraRef.current.scale * (distance / gesture.current.distance),
      )
      onCameraChange({
        scale,
        x: middleX - gesture.current.worldX * scale,
        y: middleY - gesture.current.worldY * scale,
      })
      gesture.current.distance = distance
      return
    }

    if (
      panInteraction.current?.pointerId === event.pointerId &&
      pointers.current.size === 1
    ) {
      const interaction = panInteraction.current
      onCameraChange({
        ...interaction.camera,
        x: interaction.camera.x + event.clientX - interaction.startX,
        y: interaction.camera.y + event.clientY - interaction.startY,
      })
      return
    }

    const point = pointFromClient(event.clientX, event.clientY)
    if (eraseInteraction.current === event.pointerId) {
      eraseAt(point.x, point.y)
      return
    }

    if (dragInteraction.current?.pointerId === event.pointerId) {
      const interaction = dragInteraction.current
      setPreviewItem({
        ...interaction.item,
        x: interaction.item.x + point.x - interaction.startWorldX,
        y: interaction.item.y + point.y - interaction.startWorldY,
      })
      return
    }

    const interaction = drawInteraction.current
    if (interaction?.pointerId !== event.pointerId) return
    const nativeEvents = event.nativeEvent.getCoalescedEvents?.() ?? [
      event.nativeEvent,
    ]
    const newPoints = nativeEvents.map((nativeEvent) => ({
      ...pointFromClient(nativeEvent.clientX, nativeEvent.clientY),
      pressure: getPointerPressure(nativeEvent),
      t: Math.max(0, nativeEvent.timeStamp - interaction.startedPerformance),
    }))
    interaction.points.push(...newPoints)
    const currentDraft = draftRef.current
    if (!currentDraft) return
    const nextDraft = {
      ...currentDraft,
      points: [...interaction.points],
      duration: interaction.points.at(-1)?.t ?? 0,
    }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    onDraftChange(nextDraft)
  }

  const finishPointer = (
    event: ReactPointerEvent<HTMLElement>,
    cancelled = false,
  ) => {
    pointers.current.delete(event.pointerId)

    if (gesture.current) {
      const touchCount = [...pointers.current.values()].filter(
        (pointer) => pointer.pointerType === 'touch',
      ).length
      if (touchCount < 2) {
        gesture.current = null
        onCameraSettled(cameraRef.current)
      }
      panInteraction.current = null
      return
    }

    if (panInteraction.current?.pointerId === event.pointerId) {
      panInteraction.current = null
      onCameraSettled(cameraRef.current)
    }
    if (eraseInteraction.current === event.pointerId) {
      eraseInteraction.current = null
      erasedIds.current.clear()
    }
    if (dragInteraction.current?.pointerId === event.pointerId) {
      if (previewItem) onUpdateItem(previewItem)
      dragInteraction.current = null
      setPreviewItem(null)
    }
    if (drawInteraction.current?.pointerId === event.pointerId) {
      const interaction = drawInteraction.current
      const points =
        interaction.points.length === 1
          ? [
              interaction.points[0],
              { ...interaction.points[0], t: 80 },
            ]
          : interaction.points
      const item: StrokeItem = {
        id: draftRef.current?.id ?? crypto.randomUUID(),
        type: 'stroke',
        points,
        color,
        width: tool === 'highlighter' ? strokeWidth * 2.2 : strokeWidth,
        opacity: tool === 'highlighter' ? 0.28 : 1,
        duration: Math.max(80, points.at(-1)?.t ?? 0),
        createdAt: interaction.startedAt,
        effect: inkStyle === 'sparkle' ? 'sparkle' : undefined,
        seed: inkStyle === 'sparkle' ? interaction.seed : undefined,
      }
      if (!cancelled) onAddItem(item, strokeAsEvent(item).at)
      drawInteraction.current = null
      draftRef.current = null
      setDraft(null)
      onDraftChange(null, cancelled ? 'cancel' : 'end')
    }
  }

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault()
      onActivity()
      if (
        dialMode === 'ink-size' &&
        (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') &&
        !event.ctrlKey
      ) {
        const rotation = event.deltaY || event.deltaX
        if (rotation !== 0) onStrokeWidthDelta(rotation < 0 ? 1 : -1)
        return
      }
      const bounds = containerRef.current?.getBoundingClientRect()
      const x = event.clientX - (bounds?.left ?? 0)
      const y = event.clientY - (bounds?.top ?? 0)
      const current = cameraRef.current
      const nextScale = clampScale(current.scale * Math.exp(-event.deltaY * 0.001))
      const next = {
        scale: nextScale,
        x: x - ((x - current.x) / current.scale) * nextScale,
        y: y - ((y - current.y) / current.scale) * nextScale,
      }
      onCameraChange(next)
      window.clearTimeout(wheelTimer.current)
      wheelTimer.current = window.setTimeout(
        () => onCameraSettled(cameraRef.current),
        180,
      )
    },
    [
      dialMode,
      onActivity,
      onCameraChange,
      onCameraSettled,
      onStrokeWidthDelta,
      tool,
    ],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const cursor =
    tool === 'pan' || spacePressed
      ? 'is-grab'
      : tool === 'pen' || tool === 'highlighter'
        ? 'is-drawing'
        : tool === 'eraser'
          ? 'is-erasing'
          : ''

  return (
    <div
      ref={containerRef}
      className={`canvas-viewport ${cursor}`}
      onPointerDownCapture={(event) => {
        const penAction = getPenButtonAction(event)
        const capturesTouch =
          event.pointerType === 'touch' && touchMode === 'pan'
        const capturesPen =
          penAction === 'eraser' || penAction === 'barrel'
        if (!capturesTouch && !capturesPen) return
        handlePointerDown(event)
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerMoveCapture={(event) => {
        const capturesTouch =
          event.pointerType === 'touch' && touchMode === 'pan'
        const capturesPen =
          event.pointerType === 'pen' &&
          (eraseInteraction.current === event.pointerId ||
            panInteraction.current?.pointerId === event.pointerId)
        if (!capturesTouch && !capturesPen) return
        handlePointerMove(event)
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerUpCapture={(event) => {
        const capturesTouch =
          event.pointerType === 'touch' && touchMode === 'pan'
        const capturesPen =
          event.pointerType === 'pen' &&
          (eraseInteraction.current === event.pointerId ||
            panInteraction.current?.pointerId === event.pointerId)
        if (!capturesTouch && !capturesPen) return
        finishPointer(event)
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerCancelCapture={(event) => {
        const capturesTouch =
          event.pointerType === 'touch' && touchMode === 'pan'
        const capturesPen =
          event.pointerType === 'pen' &&
          (eraseInteraction.current === event.pointerId ||
            panInteraction.current?.pointerId === event.pointerId)
        if (!capturesTouch && !capturesPen) return
        finishPointer(event, true)
        event.preventDefault()
        event.stopPropagation()
      }}
      onContextMenu={(event) => event.preventDefault()}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        event.preventDefault()
        if (event.dataTransfer.files.length > 0) {
          onFilesDropped(
            event.dataTransfer.files,
            pointFromClient(event.clientX, event.clientY),
          )
        }
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="Infinite collaborative drawing canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={(event) => finishPointer(event, true)}
        onDoubleClick={(event) => {
          if (tool !== 'select') return
          const point = pointFromClient(event.clientX, event.clientY)
          const note = createNote(point.x - 20, point.y - 20, noteColor)
          onAddItem(note)
          onSelectionChange(note.id)
        }}
      />
      <div className="notes-layer" aria-live="polite">
        {document.items
          .filter((item): item is NoteItem => item.type === 'note')
          .map((note) => (
            <EditableNote
              key={note.id}
              item={note}
              camera={camera}
              selected={selectedId === note.id}
              active={tool === 'select' || tool === 'note'}
              onSelect={() => onSelectionChange(note.id)}
              onUpdate={onUpdateItem}
              onDelete={() => onDeleteItem(note.id)}
              onActivity={onActivity}
            />
          ))}
      </div>
    </div>
  )
}
