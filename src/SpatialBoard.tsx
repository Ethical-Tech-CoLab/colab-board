import { useEffect, useRef, useState } from 'react'
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
  getItemBounds,
  getSpatialTransform,
  sparkleOffset,
  sparkleTrailHue,
} from './board'
import type { CanvasBrandTokens } from './branding'
import type {
  BoardDocument,
  BoardItem,
  NoteItem,
  PerspectiveGuide,
  Point,
} from './types'

interface SpatialBoardProps {
  document: BoardDocument
  canvasTheme: CanvasBrandTokens
  accentColor: string
  selectedId: string | null
  previewItem: BoardItem | null
  guideMode: PerspectiveGuide
  onGuideModeChange: (mode: PerspectiveGuide) => void
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
  selection: THREE.Box3Helper | null
}

const WORLD_SCALE = 0.01
const MAX_STROKE_POINTS = 140

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
      width * WORLD_SCALE * Math.max(0.35, point.pressure || 0.5) * 0.52
    const x = (point.x - center.x) * WORLD_SCALE
    const y = -(point.y - center.y) * WORLD_SCALE
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

  context.fillStyle = note.color
  context.fillRect(0, 0, canvas.width, canvas.height)
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, 'rgba(255,255,255,0.2)')
  gradient.addColorStop(1, 'rgba(23,16,32,0.08)')
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)
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
  index: number,
): THREE.Group {
  const bounds = getItemBounds(item)
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const group = new THREE.Group()
  group.position.set(
    (centerX - boardCenter.x) * WORLD_SCALE,
    -(centerY - boardCenter.y) * WORLD_SCALE,
  )
  group.userData.itemIndex = index

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
            WORLD_SCALE *
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
            (point.x + normalX * across - centerX) * WORLD_SCALE,
            -(point.y + normalY * across - centerY) * WORLD_SCALE,
            item.width *
              WORLD_SCALE *
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
            size: Math.max(0.014, item.width * WORLD_SCALE * 0.24),
            sizeAttenuation: true,
            transparent: true,
            vertexColors: true,
          }),
        ),
      )
    }
  }

  if (item.type === 'note') {
    const width = item.width * WORLD_SCALE
    const height = item.height * WORLD_SCALE
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.075),
      new THREE.MeshStandardMaterial({
        color: item.color,
        roughness: 0.72,
        metalness: 0,
      }),
    )
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.985, height * 0.985),
      new THREE.MeshBasicMaterial({
        map: createNoteTexture(item),
        transparent: true,
      }),
    )
    face.position.z = 0.039
    group.add(face)
  }

  if (item.type === 'image') {
    const width = item.width * WORLD_SCALE
    const height = item.height * WORLD_SCALE
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
  applySpatialTransform(group, item, index)
  return group
}

function applySpatialTransform(
  group: THREE.Object3D,
  item: BoardItem,
  index: number,
) {
  const spatial = getSpatialTransform(item)
  const baseZ = spatial.depth * WORLD_SCALE + index * 0.035
  group.position.z = baseZ
  group.rotation.set(
    THREE.MathUtils.degToRad(spatial.rotationX),
    THREE.MathUtils.degToRad(spatial.rotationY),
    THREE.MathUtils.degToRad(spatial.rotationZ),
  )
  group.scale.setScalar(spatial.scale)
  group.userData.baseZ = baseZ
}

function boardCenter(items: BoardItem[]): { x: number; y: number } {
  if (items.length === 0) return { x: 0, y: 0 }
  const bounds = items.map(getItemBounds)
  const left = Math.min(...bounds.map((value) => value.x))
  const top = Math.min(...bounds.map((value) => value.y))
  const right = Math.max(...bounds.map((value) => value.x + value.width))
  const bottom = Math.max(...bounds.map((value) => value.y + value.height))
  return { x: (left + right) / 2, y: (top + bottom) / 2 }
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

export default function SpatialBoard({
  document: boardDocument,
  canvasTheme,
  accentColor,
  selectedId,
  previewItem,
  guideMode,
  onGuideModeChange,
  onSelectionChange,
  onActivity,
}: SpatialBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<SceneRuntime | null>(null)
  const selectionCallback = useRef(onSelectionChange)
  const activityCallback = useRef(onActivity)
  const [error, setError] = useState('')

  useEffect(() => {
    selectionCallback.current = onSelectionChange
    activityCallback.current = onActivity
  }, [onActivity, onSelectionChange])

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
        selection: null,
      }
      runtimeRef.current = runtime

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
      const pointerDown = (event: PointerEvent) => {
        pointerStart = { x: event.clientX, y: event.clientY }
        activityCallback.current()
      }
      const pointerUp = (event: PointerEvent) => {
        if (
          Math.hypot(
            event.clientX - pointerStart.x,
            event.clientY - pointerStart.y,
          ) > 5
        ) {
          return
        }
        const bounds = renderer.domElement.getBoundingClientRect()
        pointer.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        )
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects(content.children, true)[0]
        selectionCallback.current(
          hit ? String(hit.object.userData.itemId ?? '') || null : null,
        )
      }
      renderer.domElement.addEventListener('pointerdown', pointerDown)
      renderer.domElement.addEventListener('pointerup', pointerUp)

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
        renderer.domElement.removeEventListener('pointerdown', pointerDown)
        renderer.domElement.removeEventListener('pointerup', pointerUp)
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
    for (const child of [...runtime.content.children]) {
      runtime.content.remove(child)
      disposeObject(child)
    }

    const center = boardCenter(boardDocument.items)
    boardDocument.items.forEach((item, index) => {
      runtime.content.add(createSpatialItem(item, center, index))
    })
  }, [accentColor, boardDocument.items, canvasTheme.background])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime || !previewItem) return
    const group = runtime.content.children.find(
      (child) => child.userData.itemId === previewItem.id,
    )
    if (!group) return
    applySpatialTransform(
      group,
      previewItem,
      Number(group.userData.itemIndex ?? 0),
    )
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
    <div className="spatial-viewport" ref={containerRef}>
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
          <strong>Your spatial scene is ready.</strong>
          <span>Add ink, notes, or images in Canvas view to bring it alive.</span>
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
          <Orbit /> Drag to orbit
        </span>
        <span>Scroll or pinch to zoom</span>
        <span>
          <MousePointer2 /> Tap an object to select
        </span>
      </div>
    </div>
  )
}
