import {
  Check,
  Download,
  ImagePlus,
  Pipette,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from 'react'
import {
  contrastRatio,
  createCustomBrandTheme,
  parseThemePack,
  serializeThemePack,
  type ThemeItConfig,
} from './branding'

type SampleTarget = 'primary' | 'secondary' | 'canvas' | 'surface'

interface EyeDropperResult {
  sRGBHex: string
}

interface EyeDropperInstance {
  open: () => Promise<EyeDropperResult>
}

type EyeDropperConstructor = new () => EyeDropperInstance

interface ThemeItDialogProps {
  initialTheme: ThemeItConfig
  hasSavedTheme: boolean
  onApply: (theme: ThemeItConfig) => void
  onReset: () => void
  onClose: () => void
}

const SAMPLE_TARGETS: Array<{ id: SampleTarget; label: string }> = [
  { id: 'primary', label: 'Primary' },
  { id: 'secondary', label: 'Accent' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'surface', label: 'Surface' },
]

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () =>
      reject(reader.error ?? new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function safeFileName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'custom'
  )
}

function downloadTheme(theme: ThemeItConfig) {
  const blob = new Blob([serializeThemePack(theme)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeFileName(theme.name)}.colab-theme.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function ThemeItDialog({
  initialTheme,
  hasSavedTheme,
  onApply,
  onReset,
  onClose,
}: ThemeItDialogProps) {
  const [theme, setTheme] = useState<ThemeItConfig>(initialTheme)
  const [sampleTarget, setSampleTarget] = useState<SampleTarget>('primary')
  const [referenceSrc, setReferenceSrc] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const referenceInput = useRef<HTMLInputElement>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const sampleCanvas = useRef<HTMLCanvasElement>(null)
  const previewTheme = useMemo(() => createCustomBrandTheme(theme), [theme])
  const minimumContrast = useMemo(() => {
    const foreground =
      previewTheme.css?.['--brand-foreground'] ?? '#ffffff'
    const accentInk =
      previewTheme.css?.['--brand-accent-ink'] ?? '#141414'
    return Math.min(
      contrastRatio(foreground, theme.surface),
      contrastRatio(accentInk, theme.primary),
    )
  }, [previewTheme, theme.primary, theme.surface])
  const EyeDropperApi = (
    window as Window & { EyeDropper?: EyeDropperConstructor }
  ).EyeDropper

  useEffect(() => {
    const canvas = sampleCanvas.current
    if (!canvas || !referenceSrc) return
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      setMessage('This browser cannot sample colors from the reference image.')
      return
    }
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(
        canvas.width / image.naturalWidth,
        canvas.height / image.naturalHeight,
      )
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#11131a'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(
        image,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height,
      )
    }
    image.onerror = () =>
      setMessage('The reference image could not be displayed.')
    image.src = referenceSrc
  }, [referenceSrc])

  const updateColor = (target: SampleTarget, color: string) => {
    setTheme((current) => ({ ...current, [target]: color.toLowerCase() }))
    setMessage(
      `${SAMPLE_TARGETS.find((option) => option.id === target)?.label} color sampled.`,
    )
  }

  const loadReference = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setMessage('Choose a reference image smaller than 10 MB.')
      return
    }
    try {
      setReferenceSrc(await fileAsDataUrl(file))
      setMessage('Choose a theme slot, then click a color in the image.')
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : 'The image could not be read.',
      )
    }
  }

  const loadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setMessage('Choose a logo image smaller than 2 MB.')
      return
    }
    try {
      const logoSrc = await fileAsDataUrl(file)
      setTheme((current) => ({ ...current, logoSrc }))
      setMessage('Logo added. It stays on this device unless you export the pack.')
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : 'The logo could not be read.',
      )
    }
  }

  const sampleReference = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = sampleCanvas.current
    const context = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !context || !referenceSrc) return
    const bounds = canvas.getBoundingClientRect()
    const x = Math.min(
      canvas.width - 1,
      Math.max(0, Math.floor(((event.clientX - bounds.left) / bounds.width) * canvas.width)),
    )
    const y = Math.min(
      canvas.height - 1,
      Math.max(0, Math.floor(((event.clientY - bounds.top) / bounds.height) * canvas.height)),
    )
    const [red, green, blue] = context.getImageData(x, y, 1, 1).data
    updateColor(sampleTarget, rgbToHex(red, green, blue))
  }

  const openEyeDropper = async () => {
    if (!EyeDropperApi) {
      setMessage('Upload a reference image and click it to sample in this browser.')
      return
    }
    try {
      const result = await new EyeDropperApi().open()
      updateColor(sampleTarget, result.sRGBHex)
    } catch (error: unknown) {
      setMessage(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Color sampling cancelled.'
          : 'The screen color could not be sampled.',
      )
    }
  }

  const importTheme = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setTheme(parseThemePack(await file.text()))
      setMessage('Theme pack loaded. Review it, then apply the theme.')
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : 'The theme pack could not be read.',
      )
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <section
        className="theme-it-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-it-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="transfer-heading">
            <span className="transfer-icon">
              <Sparkles />
            </span>
            <div>
              <span className="eyebrow">THEME-IT</span>
              <h2 id="theme-it-title">Sample a brand in minutes</h2>
            </div>
          </div>
          <button type="button" aria-label="Close Theme-It" onClick={onClose}>
            <X />
          </button>
        </header>

        <p className="transfer-intro">
          Upload a visual reference or use the screen eyedropper. Everything
          stays in this browser until you export a portable theme pack.
        </p>

        <div className="theme-it-layout">
          <div className="theme-it-editor">
            <div className="theme-it-fields">
              <label>
                Theme name
                <input
                  value={theme.name}
                  maxLength={40}
                  onChange={(event) =>
                    setTheme((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Organization
                <input
                  value={theme.organization}
                  maxLength={60}
                  onChange={(event) =>
                    setTheme((current) => ({
                      ...current,
                      organization: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="theme-it-colors">
              {SAMPLE_TARGETS.map(({ id, label }) => (
                <div
                  key={id}
                  className={`theme-it-color${
                    sampleTarget === id ? ' is-active' : ''
                  }`}
                >
                  <input
                    type="color"
                    value={theme[id]}
                    aria-label={`Choose ${label.toLowerCase()} color`}
                    onChange={(event) => updateColor(id, event.target.value)}
                  />
                  <button
                    type="button"
                    aria-pressed={sampleTarget === id}
                    onClick={() => setSampleTarget(id)}
                  >
                    <span>
                      <strong>{label}</strong>
                      <small>{theme[id]}</small>
                    </span>
                    {sampleTarget === id && <Check />}
                  </button>
                </div>
              ))}
            </div>

            <div className="theme-it-sampling">
              <button
                type="button"
                onClick={() => referenceInput.current?.click()}
              >
                <ImagePlus /> Reference image
              </button>
              <button type="button" onClick={openEyeDropper}>
                <Pipette /> Screen color
              </button>
              <button type="button" onClick={() => logoInput.current?.click()}>
                <Upload /> {theme.logoSrc ? 'Replace logo' : 'Add logo'}
              </button>
            </div>

            {referenceSrc && (
              <div className="theme-it-canvas-wrap">
                <canvas
                  ref={sampleCanvas}
                  width="720"
                  height="320"
                  aria-label={`Sample ${sampleTarget} color from reference image`}
                  onPointerDown={sampleReference}
                />
                <span>
                  <Pipette /> Sampling{' '}
                  {SAMPLE_TARGETS.find((option) => option.id === sampleTarget)?.label}
                </span>
              </div>
            )}
          </div>

          <aside
            className="theme-it-preview"
            style={{
              color: previewTheme.css?.['--brand-foreground'],
              background: theme.surface,
              borderColor: previewTheme.css?.['--brand-border-strong'],
            }}
          >
            <span>LIVE PREVIEW</span>
            <div
              className="theme-it-preview-mark"
              style={{
                color: previewTheme.css?.['--brand-accent-ink'],
                background: theme.primary,
              }}
            >
              {theme.logoSrc ? <img src={theme.logoSrc} alt="" /> : previewTheme.mark}
            </div>
            <strong>{previewTheme.name}</strong>
            <small>{previewTheme.organization}</small>
            <div
              className="theme-it-preview-canvas"
              style={{
                color: previewTheme.canvas.watermark,
                backgroundColor: previewTheme.canvas.background,
                backgroundImage: `radial-gradient(${previewTheme.canvas.grid} 1px, transparent 1px)`,
              }}
            >
              <i style={{ background: theme.primary }} />
              <i style={{ background: theme.secondary }} />
              <i style={{ background: previewTheme.noteColor }} />
              <span>Make ideas visible.</span>
            </div>
            <div className="theme-it-contrast">
              <Check />
              Text contrast {minimumContrast.toFixed(1)}:1
            </div>
          </aside>
        </div>

        {message && <p className="theme-it-message">{message}</p>}

        <footer className="theme-it-actions">
          <div>
            <button type="button" onClick={() => importInput.current?.click()}>
              <Upload /> Import pack
            </button>
            <button type="button" onClick={() => downloadTheme(theme)}>
              <Download /> Export pack
            </button>
            {hasSavedTheme && (
              <button type="button" className="danger" onClick={onReset}>
                <RotateCcw /> Reset custom
              </button>
            )}
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => onApply(theme)}
          >
            <Check /> Apply Theme-It
          </button>
        </footer>

        <input
          ref={referenceInput}
          className="hidden-input"
          type="file"
          accept="image/*"
          onChange={loadReference}
        />
        <input
          ref={logoInput}
          className="hidden-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={loadLogo}
        />
        <input
          ref={importInput}
          className="hidden-input"
          type="file"
          accept=".json,.colab-theme.json,application/json"
          onChange={importTheme}
        />
      </section>
    </div>
  )
}

export default ThemeItDialog
