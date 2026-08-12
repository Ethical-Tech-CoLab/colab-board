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
}

export const BRAND_THEMES: Record<BrandThemeId, BrandTheme> = {
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
  },
}

export function applyBrandTheme(theme: BrandTheme) {
  document.documentElement.dataset.brand = theme.id
  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )
  themeColor?.setAttribute('content', theme.browserThemeColor)
}
