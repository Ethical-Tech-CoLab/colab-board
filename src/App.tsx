import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  BringToFront,
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
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  StickyNote,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react'
import CanvasBoard from './CanvasBoard'
import ReplayOverlay from './ReplayOverlay'
import { BRAND_THEMES, applyBrandTheme } from './branding'
import {
  DEFAULT_CAMERA,
  applyItemEvent,
  createBoard,
  createId,
  fitImage,
  getItemBounds,
  isBoardDocument,
} from './board'
import { loadBoard, saveBoard } from './persistence'
import type {
  BoardDocument,
  BoardItem,
  Camera,
  Preferences,
  SaveState,
  ScreensaverMode,
  TimelineEvent,
  Tool,
} from './types'
import './App.css'

const DEFAULT_PREFERENCES: Preferences = {
  color: BRAND_THEMES['ethical-tech'].inkColors[0],
  strokeWidth: 5,
  idleMinutes: 2,
  screensaverMode: 'replay',
  brandTheme: 'ethical-tech',
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

function loadPreferences(): Preferences {
  try {
    const value = localStorage.getItem('colab-board-preferences')
    if (!value) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(value) as Partial<Preferences>
    const brandTheme =
      parsed.brandTheme && parsed.brandTheme in BRAND_THEMES
        ? parsed.brandTheme
        : DEFAULT_PREFERENCES.brandTheme
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      brandTheme,
      color:
        typeof parsed.color === 'string'
          ? parsed.color
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [loaded, setLoaded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsCollapsed, setSettingsCollapsed] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const [replay, setReplay] = useState<ReplayState | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const past = useRef<BoardDocument[]>([])
  const future = useRef<BoardDocument[]>([])
  const importInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const idleTimer = useRef<number | undefined>(undefined)
  const activeTheme = BRAND_THEMES[preferences.brandTheme]

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
    applyBrandTheme(activeTheme)
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
    if (preferences.idleMinutes <= 0 || board.items.length === 0) return
    idleTimer.current = window.setTimeout(
      () =>
        setReplay({
          mode: preferences.screensaverMode,
          autoLoop: true,
        }),
      preferences.idleMinutes * 60_000,
    )
  }, [board.items.length, preferences.idleMinutes, preferences.screensaverMode])

  useEffect(() => {
    scheduleIdle()
    return () => window.clearTimeout(idleTimer.current)
  }, [scheduleIdle, replay])

  const markActivity = useCallback(() => {
    scheduleIdle()
  }, [scheduleIdle])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      if (isEditing) return

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
      const shortcut: Partial<Record<string, Tool>> = {
        v: 'select',
        p: 'pen',
        h: 'highlighter',
        e: 'eraser',
        n: 'note',
      }
      const nextTool = shortcut[event.key.toLowerCase()]
      if (nextTool) setTool(nextTool)
      if (event.key === '?') setHelpOpen(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteItem, redo, selectedId, undo])

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

  const exportProject = () => {
    const blob = new Blob([JSON.stringify(board, null, 2)], {
      type: 'application/json',
    })
    downloadBlob(blob, `${safeFileName(board.title)}.colab.json`)
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

  const exportPng = () => {
    const canvas = window.document.querySelector<HTMLCanvasElement>(
      '.canvas-viewport > canvas',
    )
    if (!canvas) {
      notify('The canvas is not ready to export.', 'error')
      return
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        notify('The PNG could not be created.', 'error')
        return
      }
      downloadBlob(blob, `${safeFileName(board.title)}.png`)
      notify('Current view exported as PNG.', 'success')
    }, 'image/png')
    setMenuOpen(false)
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

  const saveLabel =
    saveState === 'loading'
      ? 'Opening local board'
      : saveState === 'saving'
        ? 'Saving locally'
        : saveState === 'error'
          ? 'Autosave needs attention'
          : 'Saved on this device'

  return (
    <div className="app-shell">
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
            className="add-media-button"
            type="button"
            onClick={() => imageInput.current?.click()}
          >
            <ImagePlus />
            <span>Add media</span>
          </button>
          <button
            className="replay-button"
            type="button"
            disabled={board.items.length === 0}
            onClick={() => setReplay({ mode: 'replay', autoLoop: false })}
          >
            <Play />
            <span>Replay</span>
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

      <main className="workspace">
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
          <CanvasBoard
            document={board}
            camera={camera}
            tool={tool}
            color={preferences.color}
            strokeWidth={preferences.strokeWidth}
            canvasTheme={activeTheme.canvas}
            noteColor={activeTheme.noteColor}
            selectedId={selectedId}
            onAddItem={addItem}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
            onCameraChange={setCamera}
            onCameraSettled={recordCamera}
            onSelectionChange={setSelectedId}
            onFilesDropped={addImageFiles}
            onActivity={markActivity}
          />

          {(tool === 'pen' || tool === 'highlighter') && (
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
                      setPreferences((current) => ({ ...current, color }))
                    }
                  />
                ))}
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

          {board.items.length === 0 && !welcomeDismissed && loaded && (
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

          <div className="zoom-controls">
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
          </div>

          <footer className="board-status">
            <span>
              <span className="status-dot" />
              Local-first · private by default
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
                        {themeOption.id === 'ethical-tech'
                          ? 'Website demo theme'
                          : 'Original board theme'}
                      </small>
                    </span>
                    {preferences.brandTheme === themeOption.id && <Check />}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <span>Idle screensaver</span>
              <div className="scene-options">
                {(
                  [
                    ['replay', 'Session replay', RotateCcw],
                    ['drift', 'Ink drift', Sparkles],
                    ['galaxy', 'CoLab galaxy', ZoomIn],
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
            </div>

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
            </div>
            <p>
              Double-click with Select to create a note. Drop images directly
              onto the canvas. Your work autosaves only on this device.
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
          theme={activeTheme}
          onClose={() => setReplay(null)}
        />
      )}
    </div>
  )
}

export default App
