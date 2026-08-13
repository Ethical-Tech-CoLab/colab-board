import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  Box,
  EyeOff,
  Focus,
  Grid3X3,
  MousePointer2,
  Orbit,
  Sparkles,
  Waypoints,
} from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  createNote,
  getItemBounds,
  getItemsCenter,
  getSpatialTransform,
  sparkleOffset,
  sparkleTrailHue,
} from './board'
import type { CanvasBrandTokens } from './branding'
import { NOTE_SURFACE_OPACITY } from './noteAppearance'
import {
  getSpatialInputAction,
  spatialItemVersion,
  spatialPlaneZ,
  spatialTransformAtDepth,
  spatialWorldToBoardPoint,
  SPATIAL_WORLD_SCALE,
} from './spatialAuthoring'
import { getPointerPressure } from './surfacePointer'
import type {
  BoardDocument,
  BoardItem,
  DialMode,
  InkStyle,
  NoteItem,
  PerspectiveGuide,
  Point,
  StrokeItem,
  Tool,
} from './types'

interface SpatialBoardProps {
  document: BoardDocument
  canvasTheme: CanvasBrandTokens
  accentColor: string
  selectedId: string | null
  previewItem: BoardItem | null
  guideMode: PerspectiveGuide
  tool: Tool
  color: string
  strokeWidth: number
  inkStyle: InkStyle
  noteColor: string
  touchMode: 'pan' | 'draw'
  dialMode: DialMode
  workPlaneDepth: number
  onGuideModeChange: (mode: PerspectiveGuide) => void
  onAddItem: (item: BoardItem, eventAt?: number) => void
  onUpdateItem: (item: BoardItem) => void
  onDeleteItem: (id: string) => void
  onFilesDropped: (
    files: FileList,
    center: { x: number; y: number },
    depth: number,
  ) => void
  onStrokeWidthDelta: (delta: number) => void
  onToolChange: (tool: Tool) => void
  onNoteEditingChange: (editing: boolean) => void
  onSelectionChange: (id: string | null) => void
  onActivity: () => void
}

interface SceneRuntime {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  content: THREE.Group
  guide: THREE.Group | null
  workPlane: THREE.Group | null
  draft: THREE.Group | null
  selection: THREE.Box3Helper | null
}

const MAX_STROKE_POINTS = 140

interface NoteEditorPosition {
  x: number
  y: number
}

function SpatialNoteEditor({
  note,
  position,
  onCommit,
  onCancel,
}: {
  note: NoteItem
  position: NoteEditorPosition
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(note.text)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    editorRef.current?.focus()
    editorRef.current?.select()
  }, [])

  const commit = () => onCommit(text)

  return (
    <div
      className="spatial-note-editor"
      style={
        {
          '--note-color': note.color,
          left: position.x,
          top: position.y,
        } as CSSProperties
      }
    >
      <textarea
        ref={editorRef}
        value={text}
        aria-label="Edit spatial note"
        placeholder="Add a thought..."
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
      <div>
        <span>Ctrl + Enter to save</span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={commit}>
          Save note
        </button>
      </div>
    </div>
  )
}

function samplePoints(points: Point[]): Point[] {
  if (points.length <= MAX_STROKE_POINTS) return points
  const step = (points.length - 1) / (MAX_STROKE_POINTS - 1)
  return Array.from(
    { length: MAX_STROKE_POINTS },
    (_, index) => points[Math.round(index * step)],
  )
}

function createPressureGeometry(
  sourcePoints: Point[],
  center: { x: number; y: number },
  width: number,
  sparkleSeed?: number,
): THREE.BufferGeometry {
  const points = samplePoints(sourcePoints)
  const sides = 8
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const color = new THREE.Color()
  let distance = 0

  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    let tangentX = next.x - previous.x
    let tangentY = -(next.y - previous.y)
    const tangentLength = Math.hypot(tangentX, tangentY) || 1
    tangentX /= tangentLength
    tangentY /= tangentLength
    const normalX = -tangentY
    const normalY = tangentX
    const radius =
      width *
      SPATIAL_WORLD_SCALE *
      Math.max(0.35, point.pressure || 0.5) *
      0.52
    const x = (point.x - center.x) * SPATIAL_WORLD_SCALE
    const y = -(point.y - center.y) * SPATIAL_WORLD_SCALE
    const z = (point.pressure - 0.5) * radius * 0.8
    if (index > 0) {
      distance += Math.hypot(point.x - previous.x, point.y - previous.y)
    }
    if (sparkleSeed !== undefined) {
      color.setHSL(
        sparkleTrailHue(sparkleSeed, distance) / 360,
        0.96,
        0.6,
        THREE.SRGBColorSpace,
      )
    }

    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2
      const around = Math.cos(angle) * radius
      positions.push(
        x + normalX * around,
        y + normalY * around,
        z + Math.sin(angle) * radius,
      )
      if (sparkleSeed !== undefined) {
        colors.push(color.r, color.g, color.b)
      }
      if (index === 0) continue
      const current = index * sides + side
      const nextSide = index * sides + ((side + 1) % sides)
      const previousRing = current - sides
      const previousNext = nextSide - sides
      indices.push(previousRing, current, nextSide)
      indices.push(previousRing, nextSide, previousNext)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  if (colors.length > 0) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  }
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of (text || 'New thought').split('\n')) {
    const words = paragraph.split(/\s+/)
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    lines.push(line)
  }
  return lines
}

function createNoteTexture(note: NoteItem): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = Math.round((canvas.width * note.height) / note.width)
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)

  context.globalAlpha = NOTE_SURFACE_OPACITY
  context.fillStyle = note.color
  context.fillRect(0, 0, canvas.width, canvas.height)
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, 'rgba(255,255,255,0.2)')
  gradient.addColorStop(1, 'rgba(23,16,32,0.08)')
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.globalAlpha = 1
  context.fillStyle = '#171020'
  context.font = '600 48px "Space Mono", monospace'
  context.textBaseline = 'top'
  wrapCanvasText(context, note.text, canvas.width - 112)
    .slice(0, 7)
    .forEach((line, index) => context.fillText(line, 56, 72 + index * 68))

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (
      !(
        child instanceof THREE.Mesh ||
        child instanceof THREE.Line ||
        child instanceof THREE.LineSegments ||
        child instanceof THREE.Points
      )
    ) {
      return
    }
    child.geometry.dispose()
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material]
    for (const material of materials) {
      if (
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshBasicMaterial
      ) {
        material.map?.dispose()
      }
      material.dispose()
    }
  })
}

function addItemId(object: THREE.Object3D, itemId: string) {
  object.userData.itemId = itemId
  object.traverse((child) => {
    child.userData.itemId = itemId
  })
}

function createSpatialItem(
  item: BoardItem,
  boardCenter: { x: number; y: number },
): THREE.Group {
  const bounds = getItemBounds(item)
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const group = new THREE.Group()
  group.position.set(
    (centerX - boardCenter.x) * SPATIAL_WORLD_SCALE,
    -(centerY - boardCenter.y) * SPATIAL_WORLD_SCALE,
  )

  if (item.type === 'stroke') {
    if (item.points.length === 0) return group
    const firstPoint = item.points[0]
    const isDot = item.points.every(
      (point) =>
        Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y) < 0.01,
    )
    const geometry = isDot
      ? new THREE.SphereGeometry(
          item.width *
            SPATIAL_WORLD_SCALE *
            Math.max(0.35, firstPoint.pressure || 0.5) *
            0.52,
          16,
          12,
        )
      : createPressureGeometry(
          item.points,
          { x: centerX, y: centerY },
          item.width,
          item.effect === 'sparkle' ? (item.seed ?? 0) : undefined,
        )
    const material = new THREE.MeshStandardMaterial({
      color: item.effect === 'sparkle' ? '#ffffff' : item.color,
      emissive: item.effect === 'sparkle' ? '#7b5cff' : item.color,
      emissiveIntensity: item.effect === 'sparkle' ? 0.22 : 0.13,
      metalness: 0.1,
      opacity: item.opacity,
      roughness: 0.26,
      transparent: item.opacity < 1,
      vertexColors: item.effect === 'sparkle' && !isDot,
    })
    group.add(new THREE.Mesh(geometry, material))
    if (item.effect === 'sparkle') {
      const positions: number[] = []
      const colors: number[] = []
      const color = new THREE.Color()
      const sampled = samplePoints(item.points)
      let distance = 0
      sampled.forEach((point, pointIndex) => {
        const previous = sampled[Math.max(0, pointIndex - 1)]
        const next = sampled[Math.min(sampled.length - 1, pointIndex + 1)]
        if (pointIndex > 0) {
          distance += Math.hypot(point.x - previous.x, point.y - previous.y)
        }
        const deltaX = next.x - previous.x
        const deltaY = next.y - previous.y
        const length = Math.hypot(deltaX, deltaY) || 1
        const normalX = -deltaY / length
        const normalY = deltaX / length

        for (let fleck = 0; fleck < 2; fleck += 1) {
          const randomIndex = pointIndex * 7 + fleck * 31
          const across =
            sparkleOffset(item.seed ?? 0, randomIndex) *
            item.width *
            Math.max(0.35, point.pressure) *
            0.4
          positions.push(
            (point.x + normalX * across - centerX) * SPATIAL_WORLD_SCALE,
            -(point.y + normalY * across - centerY) * SPATIAL_WORLD_SCALE,
            item.width *
              SPATIAL_WORLD_SCALE *
              (0.45 +
                Math.abs(sparkleOffset(item.seed ?? 0, randomIndex + 1)) * 0.3),
          )
          color.setHSL(
            sparkleTrailHue(
              item.seed ?? 0,
              distance + sparkleOffset(item.seed ?? 0, randomIndex + 2) * 34,
            ) / 360,
            1,
            0.84,
            THREE.SRGBColorSpace,
          )
          colors.push(color.r, color.g, color.b)
        }
      })
      const sparkleGeometry = new THREE.BufferGeometry()
      sparkleGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      )
      sparkleGeometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(colors, 3),
      )
      group.add(
        new THREE.Points(
          sparkleGeometry,
          new THREE.PointsMaterial({
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.9,
            size: Math.max(
              0.014,
              item.width * SPATIAL_WORLD_SCALE * 0.24,
            ),
            sizeAttenuation: true,
            transparent: true,
            vertexColors: true,
          }),
        ),
      )
    }
  }

  if (item.type === 'note') {
    const width = item.width * SPATIAL_WORLD_SCALE
    const height = item.height * SPATIAL_WORLD_SCALE
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.075),
      new THREE.MeshStandardMaterial({
        color: item.color,
        depthWrite: false,
        roughness: 0.72,
        metalness: 0,
        opacity: NOTE_SURFACE_OPACITY * 0.22,
        transparent: true,
      }),
    )
    body.receiveShadow = true
    group.add(body)
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.985, height * 0.985),
      new THREE.MeshBasicMaterial({
        depthWrite: false,
        map: createNoteTexture(item),
        transparent: true,
      }),
    )
    face.position.z = 0.039
    group.add(face)
  }

  if (item.type === 'image') {
    const width = item.width * SPATIAL_WORLD_SCALE
    const height = item.height * SPATIAL_WORLD_SCALE
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.08, height + 0.08, 0.06),
      new THREE.MeshStandardMaterial({
        color: '#f3eefb',
        metalness: 0.22,
        roughness: 0.35,
      }),
    )
    frame.castShadow = true
    group.add(frame)
    const texture = new THREE.TextureLoader().load(item.src)
    texture.colorSpace = THREE.SRGBColorSpace
    const image = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
    )
    image.position.z = 0.032
    group.add(image)
  }

  addItemId(group, item.id)
  group.userData.itemVersion = spatialItemVersion(item)
  applySpatialTransform(group, item)
  return group
}

function applySpatialTransform(
  group: THREE.Object3D,
  item: BoardItem,
) {
  const spatial = getSpatialTransform(item)
  const baseZ = spatialPlaneZ(spatial.depth, item.id)
  group.position.z = baseZ
  group.rotation.set(
    THREE.MathUtils.degToRad(spatial.rotationX),
    THREE.MathUtils.degToRad(spatial.rotationY),
    THREE.MathUtils.degToRad(spatial.rotationZ),
  )
  group.scale.setScalar(spatial.scale)
  group.userData.baseZ = baseZ
}

function createStars(accentColor: string): THREE.Points {
  const positions = new Float32Array(270)
  for (let index = 0; index < positions.length; index += 3) {
    const seed = index + 1
    positions[index] = Math.sin(seed * 12.9898) * 13
    positions[index + 1] = Math.cos(seed * 7.233) * 8
    positions[index + 2] = -2 - ((seed * 1.618) % 8)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: accentColor,
      opacity: 0.36,
      size: 0.026,
      transparent: true,
    }),
  )
}

function guideLine(
  points: THREE.Vector3[],
  color: string,
  opacity: number,
): THREE.Line {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      opacity,
      transparent: true,
    }),
  )
}

function createPerspectiveGuide(
  mode: PerspectiveGuide,
  accentColor: string,
): THREE.Group {
  const group = new THREE.Group()
  group.position.z = -1.6
  group.userData.guide = true
  if (mode === 'none') return group

  if (mode === 'grid') {
    const grid = new THREE.GridHelper(32, 32, accentColor, accentColor)
    grid.rotation.x = Math.PI / 2
    const material = grid.material as THREE.LineBasicMaterial
    material.opacity = 0.16
    material.transparent = true
    group.add(grid)
    return group
  }

  const horizonY = 1.4
  group.add(
    guideLine(
      [
        new THREE.Vector3(-16, horizonY, 0),
        new THREE.Vector3(16, horizonY, 0),
      ],
      accentColor,
      0.34,
    ),
  )

  if (mode === 'one-point') {
    const vanishingPoint = new THREE.Vector3(0, horizonY, 0)
    for (let x = -14; x <= 14; x += 2) {
      group.add(
        guideLine(
          [new THREE.Vector3(x, -9, 0), vanishingPoint],
          accentColor,
          x % 4 === 0 ? 0.24 : 0.12,
        ),
      )
    }
    return group
  }

  const left = new THREE.Vector3(-12, horizonY, 0)
  const right = new THREE.Vector3(12, horizonY, 0)
  for (let x = -10; x <= 10; x += 2) {
    const origin = new THREE.Vector3(x, -8, 0)
    group.add(guideLine([origin, left], accentColor, 0.16))
    group.add(guideLine([origin, right], '#7b5cff', 0.16))
  }
  return group
}

function createWorkPlane(z: number, accentColor: string): THREE.Group {
  const group = new THREE.Group()
  group.position.z = z
  group.userData.workPlane = true
  const geometry = new THREE.PlaneGeometry(16, 10)
  group.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: accentColor,
        depthWrite: false,
        opacity: 0.035,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    ),
  )
  group.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: accentColor,
        depthWrite: false,
        opacity: 0.34,
        transparent: true,
      }),
    ),
  )
  return group
}

function clearDraft(runtime: SceneRuntime) {
  if (!runtime.draft) return
  runtime.scene.remove(runtime.draft)
  disposeObject(runtime.draft)
  runtime.draft = null
}

function showDraft(
  runtime: SceneRuntime,
  draft: StrokeItem,
  origin: { x: number; y: number },
) {
  clearDraft(runtime)
  const preview = createSpatialItem(draft, origin)
  preview.userData.draft = true
  runtime.scene.add(preview)
  runtime.draft = preview
}

export default function SpatialBoard({
  document: boardDocument,
  canvasTheme,
  accentColor,
  selectedId,
  previewItem,
  guideMode,
  tool,
  color,
  strokeWidth,
  inkStyle,
  noteColor,
  touchMode,
  dialMode,
  workPlaneDepth,
  onGuideModeChange,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onFilesDropped,
  onStrokeWidthDelta,
  onToolChange,
  onNoteEditingChange,
  onSelectionChange,
  onActivity,
}: SpatialBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<SceneRuntime | null>(null)
  const selectionCallback = useRef(onSelectionChange)
  const activityCallback = useRef(onActivity)
  const noteEditingCallback = useRef(onNoteEditingChange)
  const itemsRef = useRef(boardDocument.items)
  const originRef = useRef<{ x: number; y: number } | null>(
    boardDocument.items.length > 0
      ? getItemsCenter(boardDocument.items)
      : null,
  )
  const originDocumentId = useRef(boardDocument.id)
  const authoringRef = useRef({
    tool,
    color,
    strokeWidth,
    inkStyle,
    noteColor,
    touchMode,
    dialMode,
    workPlaneDepth,
    onAddItem,
    onUpdateItem,
    onDeleteItem,
    onFilesDropped,
    onStrokeWidthDelta,
    onToolChange,
  })
  const [error, setError] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editorPosition, setEditorPosition] =
    useState<NoteEditorPosition | null>(null)
  const editingNote = boardDocument.items.find(
    (item): item is NoteItem =>
      item.id === editingNoteId && item.type === 'note',
  )

  itemsRef.current = boardDocument.items

  useEffect(() => {
    selectionCallback.current = onSelectionChange
    activityCallback.current = onActivity
    noteEditingCallback.current = onNoteEditingChange
  }, [onActivity, onNoteEditingChange, onSelectionChange])

  useEffect(
    () => () => noteEditingCallback.current(false),
    [],
  )

  useEffect(() => {
    if (
      editingNoteId &&
      tool !== 'select' &&
      tool !== 'note'
    ) {
      setEditingNoteId(null)
      setEditorPosition(null)
      noteEditingCallback.current(false)
    }
  }, [editingNoteId, tool])

  useEffect(() => {
    if (editingNoteId && !editingNote) {
      setEditingNoteId(null)
      setEditorPosition(null)
      noteEditingCallback.current(false)
    }
  }, [editingNote, editingNoteId])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (runtime) runtime.controls.enabled = editingNoteId === null
  }, [editingNoteId])

  useEffect(() => {
    authoringRef.current = {
      tool,
      color,
      strokeWidth,
      inkStyle,
      noteColor,
      touchMode,
      dialMode,
      workPlaneDepth,
      onAddItem,
      onUpdateItem,
      onDeleteItem,
      onFilesDropped,
      onStrokeWidthDelta,
      onToolChange,
    }
  }, [
    color,
    dialMode,
    inkStyle,
    noteColor,
    onAddItem,
    onDeleteItem,
    onFilesDropped,
    onStrokeWidthDelta,
    onToolChange,
    onUpdateItem,
    strokeWidth,
    tool,
    touchMode,
    workPlaneDepth,
  ])

  useEffect(() => {
    if (originDocumentId.current === boardDocument.id) return
    originDocumentId.current = boardDocument.id
    originRef.current =
      boardDocument.items.length > 0
        ? getItemsCenter(boardDocument.items)
        : null
  }, [boardDocument.id, boardDocument.items])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let runtime: SceneRuntime | null = null
    let resizeObserver: ResizeObserver | null = null
    let pointerStart = { x: 0, y: 0 }

    try {
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(canvasTheme.background)
      scene.fog = new THREE.FogExp2(canvasTheme.background, 0.025)
      const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100)
      camera.position.set(0, 0.3, 13)
      const renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance',
      })
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      container.appendChild(renderer.domElement)

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.055
      controls.minDistance = 3
      controls.maxDistance = 32
      controls.zoomToCursor = true

      const ambient = new THREE.HemisphereLight('#f3eefb', '#171020', 1.8)
      scene.add(ambient)
      const key = new THREE.DirectionalLight(accentColor, 4.2)
      key.position.set(-4, 6, 9)
      key.castShadow = true
      scene.add(key)
      const rim = new THREE.PointLight('#7b5cff', 18, 30)
      rim.position.set(7, -4, 4)
      scene.add(rim)
      scene.add(createStars(accentColor))

      const content = new THREE.Group()
      scene.add(content)
      runtime = {
        scene,
        camera,
        renderer,
        controls,
        content,
        guide: null,
        workPlane: null,
        draft: null,
        selection: null,
      }
      runtimeRef.current = runtime
      const sceneRuntime = runtime

      const resize = () => {
        const bounds = container.getBoundingClientRect()
        camera.aspect = Math.max(1, bounds.width) / Math.max(1, bounds.height)
        camera.updateProjectionMatrix()
        renderer.setSize(bounds.width, bounds.height, false)
      }
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)
      resize()

      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      const intersection = new THREE.Vector3()
      const workPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1))
      type DrawInteraction = {
        kind: 'draw'
        pointerId: number
        startedAt: number
        startedPerformance: number
        id: string
        depth: number
        color: string
        width: number
        opacity: number
        effect?: 'sparkle'
        seed?: number
        points: Point[]
      }
      type EraseInteraction = {
        kind: 'erase'
        pointerId: number
        erasedIds: Set<string>
      }
      let interaction: DrawInteraction | EraseInteraction | null = null
      let spacePressed = false
      let draftFrame: number | undefined

      const getOrigin = () => {
        if (!originRef.current) {
          originRef.current =
            itemsRef.current.length > 0
              ? getItemsCenter(itemsRef.current)
              : { x: 0, y: 0 }
        }
        return originRef.current
      }
      const updateRay = (event: { clientX: number; clientY: number }) => {
        const bounds = renderer.domElement.getBoundingClientRect()
        pointer.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        )
        raycaster.setFromCamera(pointer, camera)
        return bounds
      }
      const hitAt = (event: { clientX: number; clientY: number }) => {
        updateRay(event)
        return raycaster.intersectObjects(content.children, true)[0]
      }
      const pointAtDepth = (
        event: { clientX: number; clientY: number },
        depth: number,
        itemId?: string,
      ) => {
        updateRay(event)
        workPlane.constant = -spatialPlaneZ(depth, itemId)
        const world = raycaster.ray.intersectPlane(workPlane, intersection)
        return world
          ? spatialWorldToBoardPoint(world, getOrigin())
          : null
      }
      const stopAuthoringEvent = (event: PointerEvent) => {
        event.preventDefault()
      }
      const strokeFromInteraction = (
        current: DrawInteraction,
        final = false,
      ): StrokeItem => {
        const points =
          final && current.points.length === 1
            ? [
                current.points[0],
                { ...current.points[0], t: 80 },
              ]
            : [...current.points]
        return {
          id: current.id,
          type: 'stroke',
          points,
          color: current.color,
          width: current.width,
          opacity: current.opacity,
          duration: final
            ? Math.max(80, points.at(-1)?.t ?? 0)
            : (points.at(-1)?.t ?? 0),
          createdAt: current.startedAt,
          effect: current.effect,
          seed: current.seed,
          spatial: spatialTransformAtDepth(current.depth),
        }
      }
      const scheduleDraft = (current: DrawInteraction) => {
        if (draftFrame !== undefined) return
        draftFrame = requestAnimationFrame(() => {
          draftFrame = undefined
          if (interaction !== current) return
          showDraft(
            sceneRuntime,
            strokeFromInteraction(current),
            getOrigin(),
          )
        })
      }
      const eraseAt = (
        event: PointerEvent,
        current: EraseInteraction,
      ) => {
        const hit = hitAt(event)
        const id = hit ? String(hit.object.userData.itemId ?? '') : ''
        if (id && !current.erasedIds.has(id)) {
          current.erasedIds.add(id)
          authoringRef.current.onDeleteItem(id)
        }
      }
      const positionEditor = (
        event: { clientX: number; clientY: number },
        noteId: string,
      ) => {
        const bounds = renderer.domElement.getBoundingClientRect()
        setEditingNoteId(noteId)
        noteEditingCallback.current(true)
        setEditorPosition({
          x: Math.min(
            bounds.width - 150,
            Math.max(150, event.clientX - bounds.left),
          ),
          y: Math.min(
            bounds.height - 110,
            Math.max(110, event.clientY - bounds.top),
          ),
        })
      }
      const pointerDown = (event: PointerEvent) => {
        activityCallback.current()
        if (interaction && interaction.pointerId !== event.pointerId) {
          event.preventDefault()
          return
        }
        pointerStart = { x: event.clientX, y: event.clientY }
        const options = authoringRef.current
        const action = getSpatialInputAction(
          event,
          spacePressed ? 'pan' : options.tool,
          options.touchMode,
        )
        if (
          action === 'navigate' ||
          action === 'select' ||
          action === 'ignore'
        ) {
          return
        }

        const itemId = crypto.randomUUID()
        const point = pointAtDepth(event, options.workPlaneDepth, itemId)
        if (!point) return
        stopAuthoringEvent(event)
        controls.enabled = false

        if (action === 'note') {
          const note: NoteItem = {
            ...createNote(point.x - 120, point.y - 88, options.noteColor),
            id: itemId,
            spatial: spatialTransformAtDepth(options.workPlaneDepth),
          }
          options.onAddItem(note)
          options.onToolChange('select')
          selectionCallback.current(note.id)
          positionEditor(event, note.id)
          return
        }

        renderer.domElement.setPointerCapture(event.pointerId)
        if (action === 'erase') {
          interaction = {
            kind: 'erase',
            pointerId: event.pointerId,
            erasedIds: new Set(),
          }
          eraseAt(event, interaction)
          return
        }

        const startedAt = Date.now()
        const seed = Math.floor(Math.random() * 0xffffffff)
        const firstPoint: Point = {
          ...point,
          pressure: getPointerPressure(event),
          t: 0,
        }
        interaction = {
          kind: 'draw',
          pointerId: event.pointerId,
          startedAt,
          startedPerformance: performance.now(),
          id: itemId,
          depth: options.workPlaneDepth,
          color: options.color,
          width:
            options.tool === 'highlighter'
              ? options.strokeWidth * 2.2
              : options.strokeWidth,
          opacity: options.tool === 'highlighter' ? 0.28 : 1,
          effect: options.inkStyle === 'sparkle' ? 'sparkle' : undefined,
          seed: options.inkStyle === 'sparkle' ? seed : undefined,
          points: [firstPoint],
        }
        showDraft(
          sceneRuntime,
          strokeFromInteraction(interaction),
          getOrigin(),
        )
      }
      const pointerMove = (event: PointerEvent) => {
        if (!interaction || interaction.pointerId !== event.pointerId) return
        stopAuthoringEvent(event)
        activityCallback.current()
        if (interaction.kind === 'erase') {
          eraseAt(event, interaction)
          return
        }

        const current = interaction
        const nativeEvents = event.getCoalescedEvents?.() ?? [event]
        for (const nativeEvent of nativeEvents) {
          const point = pointAtDepth(
            nativeEvent,
            current.depth,
            current.id,
          )
          if (!point) continue
          current.points.push({
            ...point,
            pressure: getPointerPressure(nativeEvent),
            t: Math.max(
              0,
              nativeEvent.timeStamp - current.startedPerformance,
            ),
          })
        }
        scheduleDraft(current)
      }
      const finishPointer = (event: PointerEvent, cancelled = false) => {
        if (interaction?.pointerId === event.pointerId) {
          stopAuthoringEvent(event)
          if (!cancelled && interaction.kind === 'draw') {
            const stroke = strokeFromInteraction(interaction, true)
            authoringRef.current.onAddItem(stroke, stroke.createdAt)
            selectionCallback.current(stroke.id)
          }
          if (draftFrame !== undefined) {
            cancelAnimationFrame(draftFrame)
            draftFrame = undefined
          }
          clearDraft(sceneRuntime)
          interaction = null
          queueMicrotask(() => {
            controls.enabled = true
            if (renderer.domElement.hasPointerCapture(event.pointerId)) {
              renderer.domElement.releasePointerCapture(event.pointerId)
            }
          })
          return
        }

        if (
          Math.hypot(
            event.clientX - pointerStart.x,
            event.clientY - pointerStart.y,
          ) > 5
        ) {
          return
        }
        const action = getSpatialInputAction(
          event,
          authoringRef.current.tool,
          authoringRef.current.touchMode,
        )
        if (action !== 'select') return
        const hit = hitAt(event)
        selectionCallback.current(
          hit ? String(hit.object.userData.itemId ?? '') || null : null,
        )
      }
      const editNote = (event: MouseEvent) => {
        if (authoringRef.current.tool !== 'select') return
        const hit = hitAt(event)
        const noteId = hit ? String(hit.object.userData.itemId ?? '') : ''
        const item = itemsRef.current.find((candidate) => candidate.id === noteId)
        if (item?.type !== 'note') return
        event.preventDefault()
        selectionCallback.current(item.id)
        positionEditor(event, item.id)
      }
      const dragOver = (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }
      const drop = (event: DragEvent) => {
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return
        const options = authoringRef.current
        const point = pointAtDepth(
          event,
          options.workPlaneDepth,
        )
        if (!point) return
        event.preventDefault()
        activityCallback.current()
        options.onFilesDropped(files, point, options.workPlaneDepth)
      }
      const pointerUp = (event: PointerEvent) => finishPointer(event)
      const pointerCancel = (event: PointerEvent) =>
        finishPointer(event, true)
      const abandonInteraction = () => {
        if (!interaction) return
        if (draftFrame !== undefined) {
          cancelAnimationFrame(draftFrame)
          draftFrame = undefined
        }
        clearDraft(sceneRuntime)
        interaction = null
        controls.enabled = true
      }
      const lostPointerCapture = (event: PointerEvent) => {
        if (interaction?.pointerId === event.pointerId) abandonInteraction()
      }
      const keyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null
        if (
          event.code === 'Space' &&
          target?.tagName !== 'INPUT' &&
          target?.tagName !== 'TEXTAREA'
        ) {
          spacePressed = true
        }
      }
      const keyUp = (event: KeyboardEvent) => {
        if (event.code === 'Space') spacePressed = false
      }
      const wheel = (event: WheelEvent) => {
        const options = authoringRef.current
        if (
          options.dialMode !== 'ink-size' ||
          (options.tool !== 'pen' &&
            options.tool !== 'highlighter' &&
            options.tool !== 'eraser') ||
          event.ctrlKey
        ) {
          return
        }
        event.preventDefault()
        event.stopImmediatePropagation()
        activityCallback.current()
        const rotation = event.deltaY || event.deltaX
        if (rotation !== 0) {
          options.onStrokeWidthDelta(rotation < 0 ? 1 : -1)
        }
      }
      renderer.domElement.addEventListener('pointerdown', pointerDown, true)
      renderer.domElement.addEventListener('pointermove', pointerMove, true)
      renderer.domElement.addEventListener('pointerup', pointerUp, true)
      renderer.domElement.addEventListener('pointercancel', pointerCancel, true)
      renderer.domElement.addEventListener(
        'lostpointercapture',
        lostPointerCapture,
      )
      renderer.domElement.addEventListener('dblclick', editNote)
      renderer.domElement.addEventListener('dragover', dragOver)
      renderer.domElement.addEventListener('drop', drop)
      renderer.domElement.addEventListener('wheel', wheel, {
        capture: true,
        passive: false,
      })
      window.addEventListener('keydown', keyDown)
      window.addEventListener('keyup', keyUp)
      window.addEventListener('blur', abandonInteraction)

      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
      const startedAt = performance.now()
      renderer.setAnimationLoop(() => {
        const elapsed = (performance.now() - startedAt) / 1_000
        controls.update()
        if (!reducedMotion) {
          content.children.forEach((child, index) => {
            child.position.z =
              Number(child.userData.baseZ ?? 0) +
              Math.sin(elapsed * 0.7 + index * 0.8) * 0.025
          })
        }
        const selection = runtime?.selection
        const selected = selection
          ? content.children.find(
              (child) => child.userData.itemId === selection.userData.itemId,
            )
          : null
        if (selection && selected) {
          selection.box.setFromObject(selected).expandByScalar(0.08)
        }
        renderer.render(scene, camera)
      })

      return () => {
        renderer.setAnimationLoop(null)
        if (draftFrame !== undefined) cancelAnimationFrame(draftFrame)
        renderer.domElement.removeEventListener('pointerdown', pointerDown, true)
        renderer.domElement.removeEventListener('pointermove', pointerMove, true)
        renderer.domElement.removeEventListener('pointerup', pointerUp, true)
        renderer.domElement.removeEventListener(
          'pointercancel',
          pointerCancel,
          true,
        )
        renderer.domElement.removeEventListener(
          'lostpointercapture',
          lostPointerCapture,
        )
        renderer.domElement.removeEventListener('dblclick', editNote)
        renderer.domElement.removeEventListener('dragover', dragOver)
        renderer.domElement.removeEventListener('drop', drop)
        renderer.domElement.removeEventListener('wheel', wheel, true)
        window.removeEventListener('keydown', keyDown)
        window.removeEventListener('keyup', keyUp)
        window.removeEventListener('blur', abandonInteraction)
        resizeObserver?.disconnect()
        controls.dispose()
        disposeObject(scene)
        renderer.dispose()
        renderer.domElement.remove()
        runtimeRef.current = null
      }
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'This device could not start the spatial renderer.',
      )
      runtimeRef.current = null
      resizeObserver?.disconnect()
      runtime?.renderer.dispose()
    }
  }, [accentColor, canvasTheme.background])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    if (runtime.guide) {
      runtime.scene.remove(runtime.guide)
      disposeObject(runtime.guide)
    }
    const guide = createPerspectiveGuide(guideMode, accentColor)
    runtime.guide = guide
    runtime.scene.add(guide)
  }, [accentColor, canvasTheme.background, guideMode])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    if (runtime.workPlane) {
      runtime.scene.remove(runtime.workPlane)
      disposeObject(runtime.workPlane)
      runtime.workPlane = null
    }
    if (tool !== 'pen' && tool !== 'highlighter' && tool !== 'note') return
    const plane = createWorkPlane(
      spatialPlaneZ(workPlaneDepth),
      accentColor,
    )
    runtime.workPlane = plane
    runtime.scene.add(plane)
  }, [accentColor, tool, workPlaneDepth])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    if (!originRef.current && boardDocument.items.length > 0) {
      originRef.current = getItemsCenter(boardDocument.items)
    }
    const center = originRef.current ?? { x: 0, y: 0 }
    const itemsById = new Map(
      boardDocument.items.map((item) => [item.id, item]),
    )
    for (const child of [...runtime.content.children]) {
      const itemId = String(child.userData.itemId ?? '')
      const item = itemsById.get(itemId)
      if (
        item &&
        child.userData.itemVersion === spatialItemVersion(item)
      ) {
        continue
      }
      runtime.content.remove(child)
      disposeObject(child)
    }
    const existingIds = new Set(
      runtime.content.children.map((child) =>
        String(child.userData.itemId ?? ''),
      ),
    )
    for (const item of boardDocument.items) {
      if (!existingIds.has(item.id)) {
        runtime.content.add(createSpatialItem(item, center))
      }
    }
  }, [accentColor, boardDocument.items, canvasTheme.background])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime || !previewItem) return
    const group = runtime.content.children.find(
      (child) => child.userData.itemId === previewItem.id,
    )
    if (!group) return
    applySpatialTransform(group, previewItem)
  }, [accentColor, canvasTheme.background, previewItem])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    runtime.selection?.parent?.remove(runtime.selection)
    runtime.selection?.dispose()
    runtime.selection = null
    const selected = runtime.content.children.find(
      (child) => child.userData.itemId === selectedId,
    )
    if (selected) {
      const selection = new THREE.Box3Helper(
        new THREE.Box3().setFromObject(selected).expandByScalar(0.08),
        canvasTheme.selection,
      )
      selection.userData.itemId = selectedId
      runtime.scene.add(selection)
      runtime.selection = selection
    }
  }, [
    boardDocument.items,
    canvasTheme.background,
    canvasTheme.selection,
    previewItem,
    selectedId,
  ])

  return (
    <div
      className={`spatial-viewport is-tool-${tool}`}
      ref={containerRef}
    >
      <div className="spatial-badge">
        <Sparkles />
        <span>
          <small>LIVE WEBGL</small>
          Dimensional ink
        </span>
      </div>
      <div className="perspective-guide-picker" aria-label="Perspective guide">
        {(
          [
            ['none', 'No guide', EyeOff],
            ['grid', 'Spatial grid', Grid3X3],
            ['one-point', 'One-point perspective', Focus],
            ['two-point', 'Two-point perspective', Waypoints],
          ] as const
        ).map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            className={guideMode === mode ? 'is-active' : ''}
            aria-label={label}
            aria-pressed={guideMode === mode}
            title={label}
            onClick={() => onGuideModeChange(mode)}
          >
            <Icon />
          </button>
        ))}
      </div>
      {boardDocument.items.length === 0 && !error && (
        <div className="spatial-empty">
          <Box />
          <strong>Your Spatial canvas is ready.</strong>
          <span>Draw here, place a Post-It, or drop an image to begin.</span>
        </div>
      )}
      {error && (
        <div className="spatial-empty is-error">
          <Box />
          <strong>Spatial view is unavailable.</strong>
          <span>{error}</span>
        </div>
      )}
      <div className="spatial-hint">
        <span>
          <Orbit /> {tool === 'pan' ? 'Drag to orbit' : 'Move tool to orbit'}
        </span>
        <span>Scroll or pinch to zoom</span>
        <span>
          <MousePointer2 /> Tap an object to select
        </span>
      </div>
      {editingNote && editorPosition && (
        <SpatialNoteEditor
          key={editingNote.id}
          note={editingNote}
          position={editorPosition}
          onCancel={() => {
            setEditingNoteId(null)
            setEditorPosition(null)
            noteEditingCallback.current(false)
          }}
          onCommit={(text) => {
            if (text !== editingNote.text) {
              authoringRef.current.onUpdateItem({ ...editingNote, text })
            }
            setEditingNoteId(null)
            setEditorPosition(null)
            noteEditingCallback.current(false)
          }}
        />
      )}
    </div>
  )
}
