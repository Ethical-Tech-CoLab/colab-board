import type { BrandThemeId } from './types'

export interface CanvasBrandTokens {
  background: string
  grid: string
  watermark: string
  selection: string
  imagePlaceholder: string
}

export interface BrandTheme {
  id: BrandThemeId
  name: string
  organization: string
  productName: string
  tagline: string
  mark: string
  logoSrc?: string
  inkColors: string[]
  noteColor: string
  canvas: CanvasBrandTokens
  browserThemeColor: string
  description: string
  colorScheme: 'dark' | 'light'
  css?: Record<string, string>
}

export type BuiltInBrandThemeId = Exclude<BrandThemeId, 'custom'>

export interface ThemeItConfig {
  name: string
  organization: string
  primary: string
  secondary: string
  canvas: string
  surface: string
  logoSrc?: string
}

export interface PortableThemePack {
  kind: 'colab-theme'
  version: 1
  theme: ThemeItConfig
}

export const CUSTOM_THEME_STORAGE_KEY = 'colab-board-custom-theme'

export const DEFAULT_THEME_IT_CONFIG: ThemeItConfig = {
  name: 'My Theme',
  organization: 'Custom brand',
  primary: '#5ee0b5',
  secondary: '#7b5cff',
  canvas: '#121724',
  surface: '#1b2132',
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(
    normalized.length === 3
      ? normalized
          .split('')
          .map((character) => character.repeat(2))
          .join('')
      : normalized,
    16,
  )
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function withAlpha(hex: string, alpha: number): string {
  const [red, green, blue] = hexToRgb(hex)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexToRgb(hex)
  const [linearRed, linearGreen, linearBlue] = [red, green, blue].map(
    (channel) => {
      const value = channel / 255
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4
    },
  )
  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue
}

export function contrastRatio(foreground: string, background: string): number {
  const light = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  )
  const dark = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  )
  return (light + 0.05) / (dark + 0.05)
}

function readableInk(background: string): string {
  return contrastRatio('#141414', background) >=
    contrastRatio('#ffffff', background)
    ? '#141414'
    : '#ffffff'
}

function mix(hex: string, target: string, amount: number): string {
  const source = hexToRgb(hex)
  const destination = hexToRgb(target)
  const values = source.map((value, index) =>
    Math.round(value + (destination[index] - value) * amount),
  )
  return `#${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function readableNoteColor(color: string): string {
  let candidate = color
  for (let step = 1; step <= 7; step += 1) {
    if (contrastRatio('#25312b', candidate) >= 4.5) return candidate
    candidate = mix(color, '#ffffff', step / 8)
  }
  return '#ffffff'
}

export function createCustomBrandTheme(config: ThemeItConfig): BrandTheme {
  const foreground = readableInk(config.surface)
  const accentInk = readableInk(config.primary)
  const canvasInk = readableInk(config.canvas)
  return {
    id: 'custom',
    name: config.name.trim() || 'My Theme',
    organization: config.organization.trim() || 'Custom brand',
    productName: 'CoLab Board',
    tagline: 'Theme-It local brand',
    mark: (config.name.trim() || 'MY').slice(0, 2).toUpperCase(),
    logoSrc: config.logoSrc,
    inkColors: [
      config.primary,
      config.secondary,
      canvasInk,
      mix(config.primary, '#ffffff', 0.35),
      mix(config.secondary, '#ffffff', 0.28),
      mix(config.primary, '#000000', 0.22),
    ],
    noteColor: readableNoteColor(config.primary),
    canvas: {
      background: config.canvas,
      grid: withAlpha(config.primary, 0.14),
      watermark: withAlpha(canvasInk, 0.42),
      selection: config.primary,
      imagePlaceholder: mix(config.canvas, foreground, 0.12),
    },
    browserThemeColor: config.canvas,
    description: 'Your locally sampled Theme-It pack',
    colorScheme: foreground === '#ffffff' ? 'dark' : 'light',
    css: {
      '--brand-background': mix(config.surface, '#000000', 0.1),
      '--brand-surface': config.surface,
      '--brand-panel': mix(config.surface, foreground, 0.04),
      '--brand-card': mix(config.surface, foreground, 0.07),
      '--brand-foreground': foreground,
      '--brand-muted': `color-mix(in srgb, ${foreground} 62%, transparent)`,
      '--brand-border': `color-mix(in srgb, ${config.primary} 28%, transparent)`,
      '--brand-border-strong': `color-mix(in srgb, ${config.primary} 48%, transparent)`,
      '--brand-accent': config.primary,
      '--brand-accent-hover': mix(config.primary, foreground, 0.14),
      '--brand-accent-ink': accentInk,
      '--brand-secondary': config.secondary,
      '--brand-secondary-ink': readableInk(config.secondary),
      '--brand-canvas': config.canvas,
      '--brand-grid': `color-mix(in srgb, ${config.primary} 12%, transparent)`,
      '--brand-danger': '#ff746c',
      '--brand-success': config.primary,
      '--brand-warning': '#f7a53b',
      '--brand-glow': config.secondary,
      '--brand-glow-2': config.primary,
      '--brand-control': `color-mix(in srgb, ${foreground} 7%, transparent)`,
      '--brand-control-hover': `color-mix(in srgb, ${config.primary} 13%, transparent)`,
      '--brand-overlay': 'rgba(8, 6, 12, 0.68)',
      '--brand-shadow-color': 'rgba(4, 3, 8, 0.34)',
      '--brand-selection': config.primary,
      '--brand-glass': `color-mix(in srgb, ${config.surface} var(--overlay-opacity, 88%), transparent)`,
      '--brand-panel-glass': `color-mix(in srgb, ${mix(config.surface, foreground, 0.04)} var(--overlay-opacity, 88%), transparent)`,
    },
  }
}

export function isThemeItConfig(value: unknown): value is ThemeItConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.organization === 'string' &&
    typeof candidate.primary === 'string' &&
    HEX_COLOR.test(candidate.primary) &&
    typeof candidate.secondary === 'string' &&
    HEX_COLOR.test(candidate.secondary) &&
    typeof candidate.canvas === 'string' &&
    HEX_COLOR.test(candidate.canvas) &&
    typeof candidate.surface === 'string' &&
    HEX_COLOR.test(candidate.surface) &&
    (candidate.logoSrc === undefined ||
      (typeof candidate.logoSrc === 'string' &&
        candidate.logoSrc.startsWith('data:image/')))
  )
}

export function parseThemePack(source: string): ThemeItConfig {
  const parsed = JSON.parse(source) as unknown
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as Partial<PortableThemePack>).kind !== 'colab-theme' ||
    (parsed as Partial<PortableThemePack>).version !== 1 ||
    !isThemeItConfig((parsed as Partial<PortableThemePack>).theme)
  ) {
    throw new Error('This file is not a valid CoLab Board theme pack.')
  }
  return (parsed as PortableThemePack).theme
}

export function serializeThemePack(theme: ThemeItConfig): string {
  const pack: PortableThemePack = {
    kind: 'colab-theme',
    version: 1,
    theme,
  }
  return JSON.stringify(pack, null, 2)
}

export const BRAND_THEMES: Record<BuiltInBrandThemeId, BrandTheme> = {
  'ethical-tech': {
    id: 'ethical-tech',
    name: 'Ethical Tech CoLab',
    organization: 'NYU Ethical Tech CoLab',
    productName: 'CoLab Board',
    tagline: 'emerging tech, human condition',
    mark: 'ETC',
    logoSrc: './etc-logo.png',
    inkColors: [
      '#c8f04b',
      '#f3eefb',
      '#7b5cff',
      '#ff7aa2',
      '#57d6ff',
      '#f7a53b',
    ],
    noteColor: '#c8f04b',
    canvas: {
      background: '#171020',
      grid: 'rgba(200, 240, 75, 0.09)',
      watermark: 'rgba(243, 238, 251, 0.38)',
      selection: '#c8f04b',
      imagePlaceholder: '#2a1c3d',
    },
    browserThemeColor: '#120c1a',
    description: 'Official website identity',
    colorScheme: 'dark',
  },
  garage: {
    id: 'garage',
    name: 'The Garage · Crimson',
    organization: 'The Garage',
    productName: 'CoLab Board',
    tagline: 'ideas built together',
    mark: 'TG',
    logoSrc: './the-garage-logo-white.png',
    inkColors: [
      '#e31b3d',
      '#ffffff',
      '#c8f04b',
      '#7b5cff',
      '#57d6ff',
      '#f7a53b',
    ],
    noteColor: '#f4c5ce',
    canvas: {
      background: '#171020',
      grid: 'rgba(227, 27, 61, 0.11)',
      watermark: 'rgba(255, 255, 255, 0.38)',
      selection: '#e31b3d',
      imagePlaceholder: '#2a1c3d',
    },
    browserThemeColor: '#100b16',
    description: 'White wordmark with crimson energy',
    colorScheme: 'dark',
  },
  'garage-colab': {
    id: 'garage-colab',
    name: 'The Garage · CoLab',
    organization: 'The Garage',
    productName: 'Garage Board',
    tagline: 'ideas built together',
    mark: 'TG',
    logoSrc: './the-garage-logo-white.png',
    inkColors: [
      '#c8f04b',
      '#f3eefb',
      '#7b5cff',
      '#ff7aa2',
      '#57d6ff',
      '#f7a53b',
    ],
    noteColor: '#c8f04b',
    canvas: {
      background: '#171020',
      grid: 'rgba(200, 240, 75, 0.09)',
      watermark: 'rgba(243, 238, 251, 0.38)',
      selection: '#c8f04b',
      imagePlaceholder: '#2a1c3d',
    },
    browserThemeColor: '#120c1a',
    description: 'Garage identity on the classic CoLab design',
    colorScheme: 'dark',
  },
  studio: {
    id: 'studio',
    name: 'Warm Studio',
    organization: 'Ethical Tech CoLab',
    productName: 'CoLab Board',
    tagline: 'spatial thinking surface',
    mark: 'ET',
    inkColors: [
      '#213b31',
      '#cb5542',
      '#d6922e',
      '#246c82',
      '#695aa8',
      '#111111',
    ],
    noteColor: '#ffe39a',
    canvas: {
      background: '#f7f6f0',
      grid: 'rgba(63, 76, 69, 0.09)',
      watermark: 'rgba(41, 56, 48, 0.42)',
      selection: '#22745d',
      imagePlaceholder: '#e9ede6',
    },
    browserThemeColor: '#f7f6f0',
    description: 'Original warm whiteboard',
    colorScheme: 'light',
  },
  signal: {
    id: 'signal',
    name: 'Signal Lab',
    organization: 'Demo theme pack',
    productName: 'Signal Board',
    tagline: 'ideas with voltage',
    mark: 'SL',
    inkColors: [
      '#ff4f87',
      '#59f3ff',
      '#ffe66d',
      '#b991ff',
      '#f8f8ff',
      '#43e98b',
    ],
    noteColor: '#ffe66d',
    canvas: {
      background: '#090b1a',
      grid: 'rgba(89, 243, 255, 0.1)',
      watermark: 'rgba(248, 248, 255, 0.38)',
      selection: '#59f3ff',
      imagePlaceholder: '#181c38',
    },
    browserThemeColor: '#090b1a',
    description: 'Electric creative technology',
    colorScheme: 'dark',
  },
  ocean: {
    id: 'ocean',
    name: 'Civic Ocean',
    organization: 'Demo theme pack',
    productName: 'Commons Board',
    tagline: 'clear thinking, shared',
    mark: 'CO',
    inkColors: [
      '#00a7a5',
      '#155d8b',
      '#f5b642',
      '#ea6a47',
      '#17324d',
      '#f7fbfa',
    ],
    noteColor: '#bdeee8',
    canvas: {
      background: '#edf8f6',
      grid: 'rgba(0, 112, 118, 0.1)',
      watermark: 'rgba(18, 63, 79, 0.4)',
      selection: '#007b80',
      imagePlaceholder: '#d7ebe8',
    },
    browserThemeColor: '#dff3ef',
    description: 'Calm civic and research spaces',
    colorScheme: 'light',
  },
  sunrise: {
    id: 'sunrise',
    name: 'Sunrise Commons',
    organization: 'Demo theme pack',
    productName: 'Gather Board',
    tagline: 'make room for possibility',
    mark: 'SC',
    inkColors: [
      '#f15a3a',
      '#6d3fc0',
      '#147d73',
      '#db9b17',
      '#28213b',
      '#fff9ec',
    ],
    noteColor: '#ffd66b',
    canvas: {
      background: '#fff7e8',
      grid: 'rgba(109, 63, 192, 0.09)',
      watermark: 'rgba(60, 38, 74, 0.38)',
      selection: '#6d3fc0',
      imagePlaceholder: '#f4e5ca',
    },
    browserThemeColor: '#fff0d4',
    description: 'Warm workshops and community',
    colorScheme: 'light',
  },
}

export function applyBrandTheme(theme: BrandTheme) {
  document.documentElement.dataset.brand = theme.id
  document.documentElement.style.colorScheme = theme.colorScheme
  const customProperties = [
    '--brand-background',
    '--brand-surface',
    '--brand-panel',
    '--brand-card',
    '--brand-foreground',
    '--brand-muted',
    '--brand-border',
    '--brand-border-strong',
    '--brand-accent',
    '--brand-accent-hover',
    '--brand-accent-ink',
    '--brand-secondary',
    '--brand-secondary-ink',
    '--brand-canvas',
    '--brand-grid',
    '--brand-danger',
    '--brand-success',
    '--brand-warning',
    '--brand-glow',
    '--brand-glow-2',
    '--brand-control',
    '--brand-control-hover',
    '--brand-overlay',
    '--brand-shadow-color',
    '--brand-selection',
    '--brand-glass',
    '--brand-panel-glass',
  ]
  customProperties.forEach((property) =>
    document.documentElement.style.removeProperty(property),
  )
  Object.entries(theme.css ?? {}).forEach(([property, value]) =>
    document.documentElement.style.setProperty(property, value),
  )
  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )
  themeColor?.setAttribute('content', theme.browserThemeColor)
}
