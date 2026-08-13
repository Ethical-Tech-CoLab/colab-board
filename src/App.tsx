import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  BringToFront,
  Box,
  Check,
  CircleHelp,
  Download,
  Eraser,
  FileImage,
  FolderOpen,
  Hand,
  Highlighter,
  ImagePlus,
  Menu,
  Minus,
  MousePointer2,
  MoreHorizontal,
  Orbit,
  Paintbrush,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Play,
  Plus,
  QrCode,
  RadioTower,
  Redo2,
  RotateCcw,
  Save,
  ScanLine,
  Send,
  Settings2,
  Sparkles,
  StickyNote,
  Trash2,
  Undo2,
  Waves,
  X,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react'
import CanvasBoard from './CanvasBoard'
import DeviceTransferDialog from './DeviceTransferDialog'
import LiveSessionDialog, {
  type LiveSessionView,
} from './LiveSessionDialog'
import ReplayOverlay from './ReplayOverlay'
import SpatialInspector from './SpatialInspector'
import TakeBoardDialog from './TakeBoardDialog'
import ThemeItDialog from './ThemeItDialog'
import {
  BRAND_THEMES,
  CUSTOM_THEME_STORAGE_KEY,
  DEFAULT_THEME_IT_CONFIG,
  applyBrandTheme,
  createCustomBrandTheme,
  isThemeItConfig,
  type BuiltInBrandThemeId,
  type ThemeItConfig,
} from './branding'
import {
  DEFAULT_CAMERA,
  applyItemEvent,
  createBoard,
  createId,
  fitImage,
  getSpatialTransform,
  getItemBounds,
  isBoardDocument,
  placeItemsAtCenter,
  withSpatialTransform,
} from './board'
import { loadBoard, saveBoard } from './persistence'
import { createBrandedPng } from './exportImage'
import {
  hostLiveSession,
  joinLiveSession,
  type LiveSession,
  type LiveSessionRole,
} from './liveSession'
import {
  clearTransferIntent,
  getTransferIntent,
  type TransferContent,
} from './transfer'
import type {
  BoardDocument,
  BoardItem,
  BrandThemeId,
  Camera,
  Preferences,
  ReplayEndEffect,
  ReplayStyle,
  SaveState,
  ScreensaverMode,
  TimelineEvent,
  Tool,
} from './types'
import './App.css'

const SpatialBoard = lazy(() => import('./SpatialBoard'))

const DEFAULT_PREFERENCES: Preferences = {
  color: BRAND_THEMES['ethical-tech'].inkColors[0],
  strokeWidth: 5,
  idleMinutes: 2,
  screensaverMode: 'replay',
  replayStyle: 'accelerated',
  replayEndEffect: 'fade-white',
  brandTheme: 'ethical-tech',
  sceneMode: 'canvas',
  perspectiveGuide: 'grid',
  inkStyle: 'solid',
  overlayOpacity: 88,
  touchMode: 'pan',
  dialMode: 'zoom',
}

const TOOL_CONFIG: Array<{
  id: Tool
  label: string
  shortcut: string
  icon: LucideIcon
}> = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 },
  { id: 'pen', label: 'Pen', shortcut: 'P', icon: Pencil },
  { id: 'highlighter', label: 'Highlighter', shortcut: 'H', icon: Highlighter },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: Eraser },
  { id: 'note', label: 'Sticky note', shortcut: 'N', icon: StickyNote },
  { id: 'pan', label: 'Move canvas', shortcut: 'Space', icon: Hand },
]

interface Toast {
  id: string
  message: string
  tone: 'success' | 'error' | 'info'
}

interface ReplayState {
  mode: ScreensaverMode
  autoLoop: boolean
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function safeFileName(title: string) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'colab-board'
  )
}

function downloadBoardProject(board: BoardDocument) {
  const blob = new Blob([JSON.stringify(board, null, 2)], {
    type: 'application/json',
  })
  downloadBlob(blob, `${safeFileName(board.title)}.colab.json`)
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () =>
      reject(reader.error ?? new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

function imageDimensions(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('The selected image could not be decoded.'))
    image.src = src
  })
}

function loadCustomTheme(): ThemeItConfig | null {
  try {
    const value = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as unknown
    if (isThemeItConfig(parsed)) return parsed
    console.warn('Saved custom theme is not valid and was ignored.')
  } catch (error: unknown) {
    console.warn('Saved custom theme could not be loaded.', error)
  }
  return null
}

function isBuiltInThemeId(value: unknown): value is BuiltInBrandThemeId {
  return typeof value === 'string' && value in BRAND_THEMES
}

function loadPreferences(): Preferences {
  try {
    const value = localStorage.getItem('colab-board-preferences')
    if (!value) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(value) as Partial<Preferences>
    const brandTheme: BrandThemeId =
      parsed.brandTheme === 'custom' && loadCustomTheme()
        ? 'custom'
        : isBuiltInThemeId(parsed.brandTheme)
          ? parsed.brandTheme
          : DEFAULT_PREFERENCES.brandTheme
    const sceneMode =
      parsed.sceneMode === 'spatial' ? 'spatial' : DEFAULT_PREFERENCES.sceneMode
    const perspectiveGuide = (
      ['none', 'grid', 'one-point', 'two-point'] as const
    ).includes(parsed.perspectiveGuide ?? 'grid')
      ? (parsed.perspectiveGuide ?? DEFAULT_PREFERENCES.perspectiveGuide)
      : DEFAULT_PREFERENCES.perspectiveGuide
    const screensaverMode = (
      [
        'replay',
        'drift',
        'galaxy',
        'aurora',
        'constellation',
        'terminal',
        'snake',
      ] as const
    ).includes(parsed.screensaverMode ?? 'replay')
      ? (parsed.screensaverMode ?? DEFAULT_PREFERENCES.screensaverMode)
      : DEFAULT_PREFERENCES.screensaverMode
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      brandTheme,
      sceneMode,
      perspectiveGuide,
      screensaverMode,
      replayStyle: (
        ['exact', 'accelerated', 'artistic', 'ghosts', 'evolution'] as const
      ).includes(parsed.replayStyle ?? 'accelerated')
        ? (parsed.replayStyle ?? DEFAULT_PREFERENCES.replayStyle)
        : DEFAULT_PREFERENCES.replayStyle,
      replayEndEffect: (
        [
          'fade-white',
          'fade-black',
          'particles',
          'blueprint',
          'glitch',
          'evaporate',
        ] as const
      ).includes(parsed.replayEndEffect ?? 'fade-white')
        ? (parsed.replayEndEffect ?? DEFAULT_PREFERENCES.replayEndEffect)
        : DEFAULT_PREFERENCES.replayEndEffect,
      inkStyle:
        parsed.inkStyle === 'sparkle'
          ? 'sparkle'
          : DEFAULT_PREFERENCES.inkStyle,
      touchMode:
        parsed.touchMode === 'draw' ? 'draw' : DEFAULT_PREFERENCES.touchMode,
      dialMode:
        parsed.dialMode === 'ink-size'
          ? 'ink-size'
          : DEFAULT_PREFERENCES.dialMode,
      overlayOpacity:
        typeof parsed.overlayOpacity === 'number'
          ? Math.min(98, Math.max(58, parsed.overlayOpacity))
          : DEFAULT_PREFERENCES.overlayOpacity,
      color:
        typeof parsed.color === 'string'
          ? parsed.color
          : brandTheme === 'custom'
            ? DEFAULT_THEME_IT_CONFIG.primary
            : BRAND_THEMES[brandTheme].inkColors[0],
    }
  } catch (error: unknown) {
    console.warn('Saved appearance preferences could not be loaded.', error)
    return DEFAULT_PREFERENCES
  }
}

function App() {
  const [board, setBoard] = useState<BoardDocument>(() => createBoard())
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA)
  const [tool, setTool] = useState<Tool>('pen')
  const [preferences, setPreferences] =
    useState<Preferences>(loadPreferences)
  const [customThemeConfig, setCustomThemeConfig] =
    useState<ThemeItConfig | null>(loadCustomTheme)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [spatialPreview, setSpatialPreview] = useState<BoardItem | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [loaded, setLoaded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsCollapsed, setSettingsCollapsed] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [themeItOpen, setThemeItOpen] = useState(false)
  const [liveSessionOpen, setLiveSessionOpen] = useState(false)
  const [liveSessionState, setLiveSessionState] =
    useState<LiveSessionView | null>(null)
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const [replay, setReplay] = useState<ReplayState | null>(null)
  const [takeBoard, setTakeBoard] = useState<{
    receiveCode?: string
  } | null>(() => {
    const transfer = getTransferIntent()
    return transfer?.intent === 'take'
      ? { receiveCode: transfer.code }
      : null
  })
  const [deviceTransfer, setDeviceTransfer] = useState<{
    mode: 'send' | 'receive'
    code?: string
  } | null>(() => {
    const transfer = getTransferIntent()
    return transfer?.intent === 'send'
      ? { mode: 'receive', code: transfer.code }
      : null
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const past = useRef<BoardDocument[]>([])
  const future = useRef<BoardDocument[]>([])
  const importInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const idleTimer = useRef<number | undefined>(undefined)
  const liveSessionRef = useRef<LiveSession | null>(null)
  const liveAttempt = useRef(0)
  const applyingRemoteBoard = useRef(false)
  const boardRef = useRef(board)
  const customTheme = useMemo(
    () =>
      customThemeConfig ? createCustomBrandTheme(customThemeConfig) : null,
    [customThemeConfig],
  )
  const builtInThemeId: BuiltInBrandThemeId = isBuiltInThemeId(
    preferences.brandTheme,
  )
    ? preferences.brandTheme
    : 'ethical-tech'
  const activeTheme =
    preferences.brandTheme === 'custom' && customTheme
      ? customTheme
      : BRAND_THEMES[builtInThemeId]

  const notify = useCallback(
    (message: string, tone: Toast['tone'] = 'info') => {
      const id = createId('toast')
      setToasts((current) => [...current, { id, message, tone }])
      window.setTimeout(
        () =>
          setToasts((current) => current.filter((toast) => toast.id !== id)),
        3600,
      )
    },
    [],
  )

  useEffect(() => {
    boardRef.current = board
  }, [board])

  useEffect(
    () => () => {
      liveSessionRef.current?.close()
    },
    [],
  )

  const startLiveSession = useCallback(
    (role: LiveSessionRole, code?: string) => {
      liveSessionRef.current?.close()
      const attempt = ++liveAttempt.current
      const options = {
        onStatus: (status: LiveSessionView['status']) => {
          if (liveAttempt.current !== attempt) return
          setLiveSessionState((current) =>
            current ? { ...current, status, error: '' } : current,
          )
        },
        onDocument: (nextBoard: BoardDocument) => {
          if (liveAttempt.current !== attempt) return
          applyingRemoteBoard.current = true
          past.current = []
          future.current = []
          boardRef.current = nextBoard
          setBoard(nextBoard)
          setSelectedId(null)
          setSpatialPreview(null)
          setWelcomeDismissed(true)
        },
        onError: (error: Error) => {
          if (liveAttempt.current !== attempt) return
          setLiveSessionState((current) =>
            current
              ? { ...current, status: 'error', error: error.message }
              : current,
          )
          notify(error.message, 'error')
        },
      }

      try {
        const session =
          role === 'host'
            ? hostLiveSession(boardRef.current, options)
            : joinLiveSession(code ?? '', options)
        liveSessionRef.current = session
        setLiveSessionState({
          code: session.code,
          role: session.role,
          status: 'starting',
          error: '',
        })
      } catch (error: unknown) {
        liveSessionRef.current = null
        const message =
          error instanceof Error
            ? error.message
            : 'The live session could not be started.'
        notify(message, 'error')
      }
    },
    [notify],
  )

  const disconnectLiveSession = useCallback(() => {
    liveAttempt.current += 1
    liveSessionRef.current?.close()
    liveSessionRef.current = null
    setLiveSessionState(null)
    notify('Live board session ended. This board is local again.', 'info')
  }, [notify])

  useEffect(() => {
    if (!loaded || !liveSessionRef.current) return
    if (applyingRemoteBoard.current) {
      applyingRemoteBoard.current = false
      return
    }
    liveSessionRef.current.publish(board)
  }, [board, loaded])

  useEffect(() => {
    applyBrandTheme(activeTheme)
    document.documentElement.style.setProperty(
      '--overlay-opacity',
      `${preferences.overlayOpacity}%`,
    )
    try {
      localStorage.setItem(
        'colab-board-preferences',
        JSON.stringify(preferences),
      )
    } catch (error: unknown) {
      console.error('Appearance preferences could not be saved.', error)
    }
  }, [activeTheme, preferences])

  useEffect(() => {
    let cancelled = false
    loadBoard()
      .then((saved) => {
        if (cancelled) return
        if (saved) setBoard(saved)
        setSaveState('saved')
        setLoaded(true)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setSaveState('error')
        setLoaded(true)
        notify(
          error instanceof Error
            ? error.message
            : 'Local storage could not be opened.',
          'error',
        )
      })
    return () => {
      cancelled = true
    }
  }, [notify])

  useEffect(() => {
    if (!loaded) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      saveBoard(board)
        .then(() => setSaveState('saved'))
        .catch((error: unknown) => {
          setSaveState('error')
          notify(
            error instanceof Error ? error.message : 'Autosave failed.',
            'error',
          )
        })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [board, loaded, notify])

  const pushMutation = useCallback((event: TimelineEvent) => {
    setBoard((current) => {
      past.current = [...past.current.slice(-79), current]
      future.current = []
      return {
        ...current,
        updatedAt: Date.now(),
        items: applyItemEvent(current.items, event),
        timeline: [...current.timeline, event],
      }
    })
  }, [])

  const addItem = useCallback(
    (item: BoardItem, eventAt = item.createdAt) => {
      pushMutation({
        id: createId('event'),
        type: 'add',
        at: eventAt,
        item,
      })
      setWelcomeDismissed(true)
    },
    [pushMutation],
  )

  const updateItem = useCallback(
    (item: BoardItem) => {
      pushMutation({
        id: createId('event'),
        type: 'update',
        at: Date.now(),
        item,
      })
    },
    [pushMutation],
  )

  const deleteItem = useCallback(
    (id: string) => {
      pushMutation({
        id: createId('event'),
        type: 'delete',
        at: Date.now(),
        itemId: id,
      })
      setSpatialPreview(null)
      setSelectedId((current) => (current === id ? null : current))
    },
    [pushMutation],
  )

  const undo = useCallback(() => {
    setBoard((current) => {
      const previous = past.current.at(-1)
      if (!previous) return current
      past.current = past.current.slice(0, -1)
      future.current = [current, ...future.current.slice(0, 79)]
      return previous
    })
    setSpatialPreview(null)
    setSelectedId(null)
  }, [])

  const redo = useCallback(() => {
    setBoard((current) => {
      const next = future.current[0]
      if (!next) return current
      future.current = future.current.slice(1)
      past.current = [...past.current.slice(-79), current]
      return next
    })
    setSpatialPreview(null)
    setSelectedId(null)
  }, [])

  const recordCamera = useCallback((nextCamera: Camera) => {
    setBoard((current) => {
      const previous = current.timeline.at(-1)
      if (
        previous?.type === 'camera' &&
        previous.camera.x === nextCamera.x &&
        previous.camera.y === nextCamera.y &&
        previous.camera.scale === nextCamera.scale
      ) {
        return current
      }
      return {
        ...current,
        updatedAt: Date.now(),
        timeline: [
          ...current.timeline,
          {
            id: createId('event'),
            type: 'camera',
            at: Date.now(),
            camera: nextCamera,
          },
        ],
      }
    })
  }, [])

  const scheduleIdle = useCallback(() => {
    window.clearTimeout(idleTimer.current)
    const modalOpen = Boolean(
      replay ||
        takeBoard ||
        deviceTransfer ||
        helpOpen ||
        themeItOpen ||
        liveSessionOpen,
    )
    if (
      modalOpen ||
      preferences.idleMinutes <= 0 ||
      board.items.length === 0
    ) {
      return
    }
    idleTimer.current = window.setTimeout(
      () =>
        setReplay({
          mode: preferences.screensaverMode,
          autoLoop: true,
        }),
      preferences.idleMinutes * 60_000,
    )
  }, [
    board.items.length,
    deviceTransfer,
    helpOpen,
    liveSessionOpen,
    preferences.idleMinutes,
    preferences.screensaverMode,
    replay,
    takeBoard,
    themeItOpen,
  ])

  useEffect(() => {
    scheduleIdle()
    return () => window.clearTimeout(idleTimer.current)
  }, [scheduleIdle, replay])

  const markActivity = useCallback(() => {
    scheduleIdle()
  }, [scheduleIdle])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (takeBoard) return
      const target = event.target as HTMLElement | null
      const isEditing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      const isRangeDepthShortcut =
        target instanceof HTMLInputElement &&
        target.type === 'range' &&
        (event.key === '[' || event.key === ']')
      if (isEditing && !isRangeDepthShortcut) return

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        deleteItem(selectedId)
        return
      }
      if (
        preferences.sceneMode === 'spatial' &&
        selectedId &&
        (event.key === '[' || event.key === ']')
      ) {
        const selected = board.items.find((item) => item.id === selectedId)
        if (selected) {
          event.preventDefault()
          const depth = getSpatialTransform(selected).depth
          setSpatialPreview(null)
          updateItem(
            withSpatialTransform(selected, {
              depth: depth + (event.key === ']' ? 20 : -20),
            }),
          )
        }
        return
      }
      const shortcut: Partial<Record<string, Tool>> = {
        v: 'select',
        p: 'pen',
        h: 'highlighter',
        e: 'eraser',
        n: 'note',
      }
      const nextTool = shortcut[event.key.toLowerCase()]
      if (nextTool) {
        setTool(nextTool)
        setSpatialPreview(null)
        setPreferences((current) => ({ ...current, sceneMode: 'canvas' }))
      }
      if (event.key === '?') setHelpOpen(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    board.items,
    deleteItem,
    preferences.sceneMode,
    redo,
    selectedId,
    takeBoard,
    undo,
    updateItem,
  ])

  const addImageFiles = useCallback(
    async (files: FileList, center: { x: number; y: number }) => {
      const imageFiles = [...files].filter((file) =>
        file.type.startsWith('image/'),
      )
      if (imageFiles.length === 0) {
        notify('Choose a PNG, JPEG, GIF, WebP, or SVG image.', 'error')
        return
      }

      for (const [index, file] of imageFiles.entries()) {
        try {
          const src = await fileAsDataUrl(file)
          const dimensions = await imageDimensions(src)
          addItem(
            fitImage(src, file.name, dimensions.width, dimensions.height, {
              x: center.x + index * 28,
              y: center.y + index * 28,
            }),
          )
        } catch (error: unknown) {
          notify(
            error instanceof Error
              ? error.message
              : `Could not add ${file.name}.`,
            'error',
          )
        }
      }
      setTool('select')
    },
    [addItem, notify],
  )

  const viewCenter = useMemo(
    () => ({
      x: (window.innerWidth / 2 - camera.x) / camera.scale,
      y: ((window.innerHeight - 76) / 2 - camera.y) / camera.scale,
    }),
    [camera],
  )
  const selectedSpatialItem =
    board.items.find((item) => item.id === selectedId) ?? null

  const exportProject = () => {
    downloadBoardProject(board)
    notify('Project file exported.', 'success')
    setMenuOpen(false)
  }

  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isBoardDocument(parsed)) {
        throw new Error('This is not a valid CoLab Board project file.')
      }
      past.current = [board]
      future.current = []
      setBoard({ ...parsed, updatedAt: Date.now() })
      setSelectedId(null)
      setCamera(DEFAULT_CAMERA)
      setWelcomeDismissed(true)
      notify('Project imported.', 'success')
    } catch (error: unknown) {
      notify(
        error instanceof Error ? error.message : 'Project import failed.',
        'error',
      )
    }
  }

  const exportPng = async () => {
    setMenuOpen(false)
    const canvas = window.document.querySelector<HTMLCanvasElement>(
      '.canvas-viewport > canvas',
    )
    if (!canvas) {
      notify('The canvas is not ready to export.', 'error')
      return
    }
    try {
      const blob = await createBrandedPng(canvas, board.title)
      downloadBlob(blob, `${safeFileName(board.title)}.png`)
      notify('Branded current view exported as PNG.', 'success')
    } catch (error: unknown) {
      notify(
        error instanceof Error ? error.message : 'The PNG could not be created.',
        'error',
      )
    }
  }

  const clearBoard = () => {
    if (board.items.length === 0) return
    if (!window.confirm('Clear every item from this board? You can still undo.')) {
      return
    }
    pushMutation({
      id: createId('event'),
      type: 'clear',
      at: Date.now(),
    })
    setSelectedId(null)
    setMenuOpen(false)
    notify('Board cleared. Undo is available.', 'info')
  }

  const fitBoard = () => {
    if (board.items.length === 0) {
      setCamera(DEFAULT_CAMERA)
      recordCamera(DEFAULT_CAMERA)
      return
    }
    const bounds = board.items.map(getItemBounds)
    const left = Math.min(...bounds.map((item) => item.x))
    const top = Math.min(...bounds.map((item) => item.y))
    const right = Math.max(...bounds.map((item) => item.x + item.width))
    const bottom = Math.max(...bounds.map((item) => item.y + item.height))
    const viewport =
      window.document.querySelector('.canvas-viewport')?.getBoundingClientRect()
    const width = viewport?.width ?? window.innerWidth
    const height = viewport?.height ?? window.innerHeight - 76
    const scale = Math.min(
      1.6,
      Math.max(0.2, Math.min((width - 180) / (right - left), (height - 180) / (bottom - top))),
    )
    const next = {
      scale,
      x: width / 2 - ((left + right) / 2) * scale,
      y: height / 2 - ((top + bottom) / 2) * scale,
    }
    setCamera(next)
    recordCamera(next)
  }

  const zoomBy = (factor: number) => {
    const viewport =
      window.document.querySelector('.canvas-viewport')?.getBoundingClientRect()
    const centerX = (viewport?.width ?? window.innerWidth) / 2
    const centerY = (viewport?.height ?? window.innerHeight - 76) / 2
    const scale = Math.min(4, Math.max(0.2, camera.scale * factor))
    const next = {
      scale,
      x: centerX - ((centerX - camera.x) / camera.scale) * scale,
      y: centerY - ((centerY - camera.y) / camera.scale) * scale,
    }
    setCamera(next)
    recordCamera(next)
  }

  const updateMetadata = (
    field: 'title' | 'author' | 'watermark',
    value: string,
  ) => {
    setBoard((current) => ({
      ...current,
      [field]: value,
      updatedAt: Date.now(),
    }))
  }

  const applyCustomTheme = (theme: ThemeItConfig) => {
    try {
      localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(theme))
      setCustomThemeConfig(theme)
      setPreferences((current) => ({
        ...current,
        brandTheme: 'custom',
        color: theme.primary,
        inkStyle: 'solid',
      }))
      setThemeItOpen(false)
      notify(`${theme.name || 'Custom theme'} applied on this device.`, 'success')
    } catch (error: unknown) {
      notify(
        error instanceof Error
          ? `Custom theme could not be saved: ${error.message}`
          : 'Custom theme could not be saved on this device.',
        'error',
      )
    }
  }

  const resetCustomTheme = () => {
    try {
      localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY)
      setCustomThemeConfig(null)
      setPreferences((current) => ({
        ...current,
        brandTheme: 'ethical-tech',
        color: BRAND_THEMES['ethical-tech'].inkColors[0],
        inkStyle: 'solid',
      }))
      setThemeItOpen(false)
      notify('Custom theme reset to Ethical Tech CoLab.', 'success')
    } catch (error: unknown) {
      notify(
        error instanceof Error
          ? `Custom theme could not be reset: ${error.message}`
          : 'Custom theme could not be reset on this device.',
        'error',
      )
    }
  }

  const acceptTransferredContent = useCallback(
    (content: TransferContent) => {
      if (content.kind === 'image') {
        addItem(
          fitImage(
            content.image.src,
            content.image.name,
            content.image.width,
            content.image.height,
            viewCenter,
          ),
        )
        setTool('select')
        setDeviceTransfer(null)
        clearTransferIntent()
        notify('Image added from the personal device.', 'success')
        return
      }

      if (content.board.items.length === 0) {
        notify('The transferred board has no objects to add.', 'error')
        return
      }
      const now = Date.now()
      const importedItems = placeItemsAtCenter(
        content.board.items,
        viewCenter,
        now,
      )

      setBoard((current) => {
        past.current = [...past.current.slice(-79), current]
        future.current = []
        return {
          ...current,
          updatedAt: now,
          items: [...current.items, ...importedItems],
          timeline: [
            ...current.timeline,
            ...importedItems.map(
              (item, index): TimelineEvent => ({
                id: createId('event'),
                type: 'add',
                at: now + index,
                item,
              }),
            ),
          ],
        }
      })
      setSelectedId(importedItems.at(-1)?.id ?? null)
      setTool('select')
      setDeviceTransfer(null)
      clearTransferIntent()
      notify(
        `${importedItems.length} objects added from ${content.board.title}.`,
        'success',
      )
    },
    [addItem, notify, viewCenter],
  )

  const saveLabel =
    saveState === 'loading'
      ? 'Opening local board'
      : saveState === 'saving'
        ? 'Saving locally'
        : saveState === 'error'
          ? 'Autosave needs attention'
          : 'Saved on this device'

  return (
    <div
      className="app-shell"
      onPointerDownCapture={markActivity}
      onKeyDownCapture={markActivity}
    >
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            {activeTheme.logoSrc ? (
              <img src={activeTheme.logoSrc} alt="" />
            ) : (
              activeTheme.mark
            )}
          </div>
          <div className="brand-copy">
            <strong>{activeTheme.productName}</strong>
            <span>{activeTheme.tagline}</span>
          </div>
        </div>

        <label className="board-title">
          <span className="sr-only">Board title</span>
          <input
            value={board.title}
            maxLength={80}
            onChange={(event) => updateMetadata('title', event.target.value)}
          />
          <span className={`save-state is-${saveState}`}>
            {saveState === 'saved' ? <Check size={12} /> : <Save size={12} />}
            {saveLabel}
          </span>
        </label>

        <div className="header-actions">
          <div className="history-actions">
            <button
              type="button"
              onClick={undo}
              disabled={past.current.length === 0}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={future.current.length === 0}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 />
            </button>
          </div>
          <button
            className="replay-button"
            type="button"
            aria-label="Replay board"
            disabled={board.items.length === 0}
            onClick={() => setReplay({ mode: 'replay', autoLoop: false })}
          >
            <Play />
            <span>Replay</span>
          </button>
          <button
            className="take-board-button"
            type="button"
            aria-label="Take board"
            title="Take board"
            disabled={board.items.length === 0}
            onClick={() => setTakeBoard({})}
          >
            <QrCode />
          </button>
          <button
            className="receive-device-button"
            type="button"
            aria-label="Add from device"
            title="Add from device"
            onClick={() => setDeviceTransfer({ mode: 'receive' })}
          >
            <ScanLine />
          </button>
          <div className="menu-anchor">
            <button
              type="button"
              aria-label="Board menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal />
            </button>
            {menuOpen && (
              <div className="board-menu">
                <button type="button" onClick={exportProject}>
                  <Download /> Export project
                </button>
                <button type="button" onClick={exportPng}>
                  <FileImage /> Export current view
                </button>
                <button
                  type="button"
                  onClick={() => importInput.current?.click()}
                >
                  <FolderOpen /> Import project
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeviceTransfer({ mode: 'send' })
                    setMenuOpen(false)
                  }}
                >
                  <Send /> Send to a board
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLiveSessionOpen(true)
                    setMenuOpen(false)
                  }}
                >
                  <RadioTower />
                  {liveSessionState
                    ? `Live board · ${liveSessionState.code}`
                    : 'Start or join live board'}
                </button>
                <hr />
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(true)
                    setSettingsCollapsed(false)
                    setMenuOpen(false)
                  }}
                >
                  <Settings2 /> Board settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHelpOpen(true)
                    setMenuOpen(false)
                  }}
                >
                  <CircleHelp /> Shortcuts & help
                </button>
                <hr />
                <button className="danger" type="button" onClick={clearBoard}>
                  <Trash2 /> Clear board
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        className={`workspace${settingsOpen ? ' has-settings' : ''}${
          settingsCollapsed ? ' is-settings-collapsed' : ''
        }`}
      >
        <aside className="toolbar" aria-label="Drawing tools">
          {TOOL_CONFIG.map(({ id, label, shortcut, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={tool === id ? 'is-active' : ''}
              aria-pressed={tool === id}
              aria-label={`${label} (${shortcut})`}
              title={`${label} · ${shortcut}`}
              onClick={() => {
                setSpatialPreview(null)
                setPreferences((current) => ({
                  ...current,
                  sceneMode: 'canvas',
                }))
                setTool(id)
                setSelectedId(null)
                markActivity()
              }}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
          <div className="toolbar-rule" />
          <button
            type="button"
            aria-label="Add image"
            title="Add image"
            onClick={() => imageInput.current?.click()}
          >
            <ImagePlus />
            <span>Image</span>
          </button>
        </aside>

        <section className="board-area">
          {preferences.sceneMode === 'canvas' ? (
            <CanvasBoard
              document={board}
              camera={camera}
              tool={tool}
              color={preferences.color}
              strokeWidth={preferences.strokeWidth}
              inkStyle={preferences.inkStyle}
              canvasTheme={activeTheme.canvas}
              noteColor={activeTheme.noteColor}
              touchMode={preferences.touchMode}
              dialMode={preferences.dialMode}
              selectedId={selectedId}
              onAddItem={addItem}
              onUpdateItem={updateItem}
              onDeleteItem={deleteItem}
              onCameraChange={setCamera}
              onCameraSettled={recordCamera}
              onSelectionChange={setSelectedId}
              onFilesDropped={addImageFiles}
              onStrokeWidthDelta={(delta) =>
                setPreferences((current) => ({
                  ...current,
                  strokeWidth: Math.min(
                    30,
                    Math.max(1, current.strokeWidth + delta),
                  ),
                }))
              }
              onActivity={markActivity}
            />
          ) : (
            <Suspense
              fallback={
                <div className="spatial-viewport">
                  <div className="spatial-empty">
                    <Sparkles />
                    <strong>Opening spatial view…</strong>
                  </div>
                </div>
              }
            >
              <SpatialBoard
                document={board}
                canvasTheme={activeTheme.canvas}
                accentColor={activeTheme.inkColors[0]}
                selectedId={selectedId}
                previewItem={spatialPreview}
                guideMode={preferences.perspectiveGuide}
                onGuideModeChange={(perspectiveGuide) =>
                  setPreferences((current) => ({
                    ...current,
                    perspectiveGuide,
                  }))
                }
                onSelectionChange={(id) => {
                  setSpatialPreview(null)
                  setSelectedId(id)
                }}
                onActivity={markActivity}
              />
            </Suspense>
          )}

          <div className="scene-mode-switcher" aria-label="Board view">
            <button
              type="button"
              className={preferences.sceneMode === 'canvas' ? 'is-active' : ''}
              aria-pressed={preferences.sceneMode === 'canvas'}
              onClick={() => {
                setSpatialPreview(null)
                setPreferences((current) => ({
                  ...current,
                  sceneMode: 'canvas',
                }))
              }}
            >
              <Pencil /> Canvas
            </button>
            <button
              type="button"
              className={preferences.sceneMode === 'spatial' ? 'is-active' : ''}
              aria-pressed={preferences.sceneMode === 'spatial'}
              onClick={() =>
                setPreferences((current) => ({
                  ...current,
                  sceneMode: 'spatial',
                }))
              }
            >
              <Box /> Spatial
              <small>3D</small>
            </button>
          </div>

          {preferences.sceneMode === 'spatial' && selectedSpatialItem && (
            <SpatialInspector
              item={selectedSpatialItem}
              onPreview={setSpatialPreview}
              onCommit={(item) => {
                setSpatialPreview(null)
                updateItem(item)
              }}
              onClose={() => {
                setSpatialPreview(null)
                setSelectedId(null)
              }}
            />
          )}

          {preferences.sceneMode === 'canvas' &&
            (tool === 'pen' || tool === 'highlighter') && (
            <div className="tool-options">
              <div className="color-options" aria-label="Ink color">
                {activeTheme.inkColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={preferences.color === color ? 'is-active' : ''}
                    style={{ '--swatch': color } as React.CSSProperties}
                    aria-label={`Use color ${color}`}
                    onClick={() =>
                      setPreferences((current) => ({
                        ...current,
                        color,
                        inkStyle: 'solid',
                      }))
                    }
                  />
                ))}
                <button
                  type="button"
                  className={`sparkle-swatch${
                    preferences.inkStyle === 'sparkle' ? ' is-active' : ''
                  }`}
                  aria-label="Use sparkly multicolor ink"
                  title="Sparkly multicolor ink"
                  onClick={() =>
                    setPreferences((current) => ({
                      ...current,
                      inkStyle: 'sparkle',
                       strokeWidth: Math.max(10, current.strokeWidth),
                    }))
                  }
                >
                  <Sparkles />
                </button>
              </div>
              <span className="options-divider" />
              <label className="stroke-size">
                <Pencil size={15} />
                <input
                  type="range"
                  min="2"
                  max="22"
                  value={preferences.strokeWidth}
                  aria-label="Stroke width"
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      strokeWidth: Number(event.target.value),
                    }))
                  }
                />
                <span>{preferences.strokeWidth}px</span>
              </label>
            </div>
          )}

          {preferences.sceneMode === 'canvas' &&
            board.items.length === 0 &&
            !welcomeDismissed &&
            loaded && (
            <div className="welcome-card">
              <button
                className="welcome-close"
                type="button"
                aria-label="Dismiss welcome"
                onClick={() => setWelcomeDismissed(true)}
              >
                <X />
              </button>
              <div className="welcome-icon">
                <Sparkles />
              </div>
              <p className="eyebrow">YOUR THINKING SPACE IS READY</p>
              <h1>Make ideas visible.</h1>
              <p>
                Sketch with a pen, arrange evidence, and let the board replay
                how your thinking evolved.
              </p>
              <div className="welcome-actions">
                <button
                  type="button"
                  onClick={() => {
                    setTool('pen')
                    setWelcomeDismissed(true)
                  }}
                >
                  <Pencil /> Start sketching
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTool('note')
                    setWelcomeDismissed(true)
                  }}
                >
                  <StickyNote /> Add a thought
                </button>
              </div>
              <span className="welcome-tip">
                Tip: hold <kbd>Space</kbd> and drag to move around
              </span>
            </div>
          )}

          {preferences.sceneMode === 'canvas' && <div className="zoom-controls">
            <button type="button" onClick={() => zoomBy(0.82)} aria-label="Zoom out">
              <Minus />
            </button>
            <button type="button" onClick={fitBoard} className="zoom-value">
              {Math.round(camera.scale * 100)}%
            </button>
            <button type="button" onClick={() => zoomBy(1.22)} aria-label="Zoom in">
              <Plus />
            </button>
            <button type="button" onClick={fitBoard} aria-label="Fit board">
              <BringToFront />
            </button>
          </div>}

          <footer className="board-status">
            <span>
              <span className="status-dot" />
              {preferences.sceneMode === 'spatial'
                ? 'Spatial view · local WebGL'
                : 'Local-first · private by default'}
            </span>
            <span>{board.items.length} {board.items.length === 1 ? 'object' : 'objects'}</span>
            <button type="button" onClick={() => setHelpOpen(true)}>
              <CircleHelp /> Help
            </button>
          </footer>
        </section>

        {settingsOpen && (
          <aside
            className={`settings-panel${settingsCollapsed ? ' is-collapsed' : ''}`}
            aria-label="Board settings"
          >
            <header>
              <div>
                <span className="eyebrow">BOARD DETAILS</span>
                <h2>Make it yours</h2>
              </div>
              <div className="panel-actions">
                <button
                  className="panel-collapse"
                  type="button"
                  aria-label={
                    settingsCollapsed
                      ? 'Expand settings panel'
                      : 'Collapse settings panel'
                  }
                  aria-expanded={!settingsCollapsed}
                  onClick={() => setSettingsCollapsed((value) => !value)}
                >
                  {settingsCollapsed ? (
                    <PanelRightOpen />
                  ) : (
                    <PanelRightClose />
                  )}
                </button>
                <button
                  className="panel-close"
                  type="button"
                  aria-label="Close settings"
                  onClick={() => setSettingsOpen(false)}
                >
                  <X />
                </button>
              </div>
            </header>

            <label>
              Board title
              <input
                value={board.title}
                onChange={(event) => updateMetadata('title', event.target.value)}
              />
            </label>
            <label>
              Facilitator / author
              <input
                value={board.author}
                placeholder="Optional"
                onChange={(event) => updateMetadata('author', event.target.value)}
              />
            </label>
            <label>
              Canvas watermark
              <input
                value={board.watermark}
                placeholder="Leave blank to hide"
                onChange={(event) =>
                  updateMetadata('watermark', event.target.value)
                }
              />
            </label>

            <div className="settings-section">
              <span>Brand theme</span>
              <div className="brand-options">
                {Object.values(BRAND_THEMES).map((themeOption) => (
                  <button
                    key={themeOption.id}
                    type="button"
                    className={
                      preferences.brandTheme === themeOption.id
                        ? 'is-active'
                        : ''
                    }
                    onClick={() =>
                      setPreferences((current) => ({
                        ...current,
                        brandTheme: themeOption.id,
                        color: themeOption.inkColors[0],
                        inkStyle: 'solid',
                      }))
                    }
                  >
                    <span
                      className={`theme-preview preview-${themeOption.id}`}
                      aria-hidden="true"
                    >
                      {themeOption.logoSrc ? (
                        <img src={themeOption.logoSrc} alt="" />
                      ) : (
                        themeOption.mark
                      )}
                    </span>
                    <span>
                      <strong>{themeOption.name}</strong>
                      <small>
                        {themeOption.description}
                      </small>
                    </span>
                    {preferences.brandTheme === themeOption.id && <Check />}
                  </button>
                ))}
                {customTheme && (
                  <button
                    type="button"
                    className={
                      preferences.brandTheme === 'custom' ? 'is-active' : ''
                    }
                    onClick={() =>
                      setPreferences((current) => ({
                        ...current,
                        brandTheme: 'custom',
                        color: customTheme.inkColors[0],
                        inkStyle: 'solid',
                      }))
                    }
                  >
                    <span
                      className="theme-preview preview-custom"
                      style={{
                        background: `linear-gradient(145deg, ${customThemeConfig?.primary}, ${customThemeConfig?.secondary})`,
                      }}
                      aria-hidden="true"
                    >
                      {customTheme.logoSrc ? (
                        <img src={customTheme.logoSrc} alt="" />
                      ) : (
                        customTheme.mark
                      )}
                    </span>
                    <span>
                      <strong>{customTheme.name}</strong>
                      <small>{customTheme.description}</small>
                    </span>
                    {preferences.brandTheme === 'custom' && <Check />}
                  </button>
                )}
                <button
                  type="button"
                  className="theme-it-launch"
                  onClick={() => setThemeItOpen(true)}
                >
                  <span className="theme-preview preview-theme-it" aria-hidden="true">
                    <Paintbrush />
                  </span>
                  <span>
                    <strong>Theme-It</strong>
                    <small>Sample colors and add a local logo</small>
                  </span>
                  <Sparkles />
                </button>
              </div>
            </div>

            <div className="settings-section">
              <span>Touch input</span>
              <div className="scene-options">
                <button
                  type="button"
                  className={preferences.touchMode === 'pan' ? 'is-active' : ''}
                  onClick={() =>
                    setPreferences((current) => ({
                      ...current,
                      touchMode: 'pan',
                    }))
                  }
                >
                  <Hand />
                  <span>One finger moves canvas</span>
                  {preferences.touchMode === 'pan' && <Check />}
                </button>
                <button
                  type="button"
                  className={preferences.touchMode === 'draw' ? 'is-active' : ''}
                  onClick={() =>
                    setPreferences((current) => ({
                      ...current,
                      touchMode: 'draw',
                    }))
                  }
                >
                  <Pencil />
                  <span>Draw with touch</span>
                  {preferences.touchMode === 'draw' && <Check />}
                </button>
              </div>
              <p className="settings-hint">
                Surface mode keeps fingers for moving and pinch zoom while a pen
                draws.
              </p>
              <div className="surface-pen-support">
                <Pencil />
                <span>
                  <strong>Surface Pen ready</strong>
                  Pressure controls ink. Flip to the rear eraser to erase with any
                  selected tool; hold the barrel button to move the canvas.
                </span>
              </div>
            </div>

            <div className="settings-section">
              <span>Wheel / Surface Dial</span>
              <div className="scene-options">
                <button
                  type="button"
                  className={preferences.dialMode === 'zoom' ? 'is-active' : ''}
                  onClick={() =>
                    setPreferences((current) => ({
                      ...current,
                      dialMode: 'zoom',
                    }))
                  }
                >
                  <ZoomIn />
                  <span>Zoom canvas</span>
                  {preferences.dialMode === 'zoom' && <Check />}
                </button>
                <button
                  type="button"
                  className={
                    preferences.dialMode === 'ink-size' ? 'is-active' : ''
                  }
                  onClick={() =>
                    setPreferences((current) => ({
                      ...current,
                      dialMode: 'ink-size',
                    }))
                  }
                >
                  <Pencil />
                  <span>Adjust ink size</span>
                  {preferences.dialMode === 'ink-size' && <Check />}
                </button>
              </div>
              <p className="settings-hint">
                Surface Dial rotation arrives as wheel input in the browser. In
                ink-size mode, hold Ctrl while rotating to zoom.
              </p>
            </div>

            <div className="settings-section">
              <span>Idle screensaver</span>
              <div className="scene-options">
                {(
                  [
                    ['replay', 'Session replay', RotateCcw],
                    ['drift', 'Ink drift', Sparkles],
                    ['galaxy', 'CoLab galaxy', ZoomIn],
                    ['aurora', 'Aurora flow', Waves],
                    ['constellation', 'Idea constellation', Orbit],
                    ['terminal', 'WarGames terminal', Menu],
                    ['snake', 'Retro snake', RotateCcw],
                  ] as const
                ).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    className={
                      preferences.screensaverMode === mode ? 'is-active' : ''
                    }
                    onClick={() =>
                      setPreferences((current) => ({
                        ...current,
                        screensaverMode: mode,
                      }))
                    }
                  >
                    <Icon />
                    <span>{label}</span>
                    {preferences.screensaverMode === mode && <Check />}
                  </button>
                ))}
              </div>
              {preferences.screensaverMode === 'replay' && (
                <div className="replay-studio-settings">
                  <span>Replay Studio</span>
                  <label>
                    Treatment
                    <select
                      value={preferences.replayStyle}
                      onChange={(event) =>
                        setPreferences((current) => ({
                          ...current,
                          replayStyle: event.target.value as ReplayStyle,
                        }))
                      }
                    >
                      <option value="exact">Exact replay</option>
                      <option value="accelerated">Accelerated</option>
                      <option value="artistic">Artistic camera</option>
                      <option value="ghosts">Ghost trails</option>
                      <option value="evolution">Infinite evolution</option>
                    </select>
                  </label>
                  <label>
                    Ending
                    <select
                      value={preferences.replayEndEffect}
                      onChange={(event) =>
                        setPreferences((current) => ({
                          ...current,
                          replayEndEffect: event.target.value as ReplayEndEffect,
                        }))
                      }
                    >
                      <option value="fade-white">Fade to white</option>
                      <option value="fade-black">Fade to black</option>
                      <option value="particles">Particle dissolve</option>
                      <option value="blueprint">Blueprint burnoff</option>
                      <option value="glitch">Digital glitch</option>
                      <option value="evaporate">Ink evaporation</option>
                    </select>
                  </label>
                </div>
              )}
              <button
                className="preview-screensaver"
                type="button"
                disabled={board.items.length === 0}
                onClick={() =>
                  setReplay({
                    mode: preferences.screensaverMode,
                    autoLoop: false,
                  })
                }
              >
                <Play /> Preview screensaver
              </button>
            </div>

            <label className="overlay-opacity-control">
              <span>
                Overlay opacity
                <output>{preferences.overlayOpacity}%</output>
              </span>
              <input
                type="range"
                min="58"
                max="98"
                step="1"
                value={preferences.overlayOpacity}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    overlayOpacity: Number(event.target.value),
                  }))
                }
              />
              <small>
                Lower values reveal more of the board beneath glass panels.
              </small>
            </label>
            <button
              className="overlay-opacity-reset"
              type="button"
              disabled={preferences.overlayOpacity === 88}
              onClick={() =>
                setPreferences((current) => ({
                  ...current,
                  overlayOpacity: 88,
                }))
              }
            >
              <RotateCcw /> Reset overlay opacity
            </button>

            <label>
              Start after
              <select
                value={preferences.idleMinutes}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    idleMinutes: Number(event.target.value),
                  }))
                }
              >
                <option value="1">1 minute</option>
                <option value="2">2 minutes</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="0">Never</option>
              </select>
            </label>

            <div className="provenance-card">
              <span>
                <Menu /> Provenance
              </span>
              <dl>
                <div>
                  <dt>Session</dt>
                  <dd>{board.id.slice(-8)}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{new Date(board.createdAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt>Events</dt>
                  <dd>{board.timeline.length}</dd>
                </div>
              </dl>
              <p>Timeline and authorship stay embedded in project exports.</p>
            </div>
          </aside>
        )}
      </main>

      {helpOpen && (
        <div className="modal-backdrop" onPointerDown={() => setHelpOpen(false)}>
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">QUICK GUIDE</span>
                <h2 id="help-title">Move at the speed of thought</h2>
              </div>
              <button
                type="button"
                aria-label="Close help"
                onClick={() => setHelpOpen(false)}
              >
                <X />
              </button>
            </header>
            <div className="help-grid">
              {TOOL_CONFIG.slice(0, 5).map(({ label, shortcut, icon: Icon }) => (
                <div key={label}>
                  <Icon />
                  <span>{label}</span>
                  <kbd>{shortcut}</kbd>
                </div>
              ))}
              <div>
                <Hand />
                <span>Pan canvas</span>
                <kbd>Space + drag</kbd>
              </div>
              <div>
                <Undo2 />
                <span>Undo</span>
                <kbd>Ctrl Z</kbd>
              </div>
              <div>
                <ZoomIn />
                <span>Zoom</span>
                <kbd>Wheel / pinch</kbd>
              </div>
              <div>
                <Eraser />
                <span>Surface Pen eraser</span>
                <kbd>Flip pen</kbd>
              </div>
              <div>
                <RadioTower />
                <span>Live peer board</span>
                <kbd>Board menu</kbd>
              </div>
              <div>
                <Box />
                <span>Spatial depth</span>
                <kbd>[ / ]</kbd>
              </div>
            </div>
            <p>
              Double-click with Select to create a note. Drop images directly
              onto the canvas, then open Spatial view to orbit and shape the
              scene. Your work autosaves only on this device.
              Surface Pen top-button shortcuts remain managed by Windows and are
              not exposed to browser apps.
            </p>
          </section>
        </div>
      )}

      <input
        ref={importInput}
        className="hidden-input"
        type="file"
        accept=".json,.colab.json,application/json"
        onChange={importProject}
      />
      <input
        ref={imageInput}
        className="hidden-input"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          if (event.target.files) addImageFiles(event.target.files, viewCenter)
          event.target.value = ''
        }}
      />

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast is-${toast.tone}`}>
            {toast.tone === 'success' ? <Check /> : <CircleHelp />}
            {toast.message}
          </div>
        ))}
      </div>

      {replay && (
        <ReplayOverlay
          document={board}
          mode={replay.mode}
          autoLoop={replay.autoLoop}
          replayStyle={preferences.replayStyle}
          endEffect={preferences.replayEndEffect}
          theme={activeTheme}
          onClose={() => setReplay(null)}
        />
      )}
      {takeBoard && (
        <TakeBoardDialog
          board={board}
          receiveCode={takeBoard.receiveCode}
          onClose={() => setTakeBoard(null)}
          onDownload={(receivedBoard) => {
            downloadBoardProject(receivedBoard)
            notify('Project file saved.', 'success')
          }}
          onOpen={(receivedBoard) => {
            past.current = [board]
            future.current = []
            setBoard({ ...receivedBoard, updatedAt: Date.now() })
            setCamera(DEFAULT_CAMERA)
            setSelectedId(null)
            setWelcomeDismissed(true)
            setTakeBoard(null)
            notify('Transferred board opened on this device.', 'success')
          }}
        />
      )}
      {deviceTransfer && (
        <DeviceTransferDialog
          mode={deviceTransfer.mode}
          initialCode={deviceTransfer.code}
          onClose={() => {
            if (deviceTransfer.code) clearTransferIntent()
            setDeviceTransfer(null)
          }}
          onAccept={acceptTransferredContent}
        />
      )}
      {themeItOpen && (
        <ThemeItDialog
          initialTheme={customThemeConfig ?? DEFAULT_THEME_IT_CONFIG}
          hasSavedTheme={Boolean(customThemeConfig)}
          onApply={applyCustomTheme}
          onReset={resetCustomTheme}
          onClose={() => setThemeItOpen(false)}
        />
      )}
      {liveSessionOpen && (
        <LiveSessionDialog
          session={liveSessionState}
          onHost={() => startLiveSession('host')}
          onJoin={(code) => startLiveSession('join', code)}
          onDisconnect={disconnectLiveSession}
          onClose={() => setLiveSessionOpen(false)}
        />
      )}
    </div>
  )
}

export default App
