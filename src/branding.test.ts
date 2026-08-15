import { describe, expect, it } from 'vitest'
import {
  BRAND_THEMES,
  createCustomBrandTheme,
  type BuiltInBrandThemeId,
} from './branding'

describe('bundled brand themes', () => {
  it('ships The Garage with its white wordmark and crimson identity', () => {
    expect(BRAND_THEMES.garage).toMatchObject({
      name: 'The Garage · Crimson',
      logoSrc: './the-garage-logo-white.png',
      colorScheme: 'dark',
      canvas: {
        background: BRAND_THEMES['ethical-tech'].canvas.background,
        selection: '#e31b3d',
      },
    })
    expect(BRAND_THEMES.garage.inkColors).toEqual(
      expect.arrayContaining(['#e31b3d', '#ffffff']),
    )
  })

  it('ships a Garage identity variant on the exact CoLab palette', () => {
    const colab = BRAND_THEMES['ethical-tech']
    const garage = BRAND_THEMES['garage-colab']

    expect(garage).toMatchObject({
      name: 'The Garage · CoLab',
      productName: 'Garage Board',
      logoSrc: './the-garage-logo-white.png',
      inkColors: colab.inkColors,
      noteColor: colab.noteColor,
      canvas: colab.canvas,
      browserThemeColor: colab.browserThemeColor,
      colorScheme: colab.colorScheme,
    })
  })
})

describe('brand theme color-scheme tokens', () => {
  const DARK_THEME_IDS: BuiltInBrandThemeId[] = [
    'ethical-tech',
    'garage',
    'garage-colab',
    'signal',
  ]
  const LIGHT_THEME_IDS: BuiltInBrandThemeId[] = ['studio', 'ocean', 'sunrise']

  it.each(DARK_THEME_IDS)(
    'built-in dark theme %s declares colorScheme dark',
    (id) => {
      expect(BRAND_THEMES[id].colorScheme).toBe('dark')
    },
  )

  it.each(LIGHT_THEME_IDS)(
    'built-in light theme %s declares colorScheme light',
    (id) => {
      expect(BRAND_THEMES[id].colorScheme).toBe('light')
    },
  )
})

describe('createCustomBrandTheme color legibility', () => {
  it('derives dark colorScheme and white foreground for a near-black surface', () => {
    const theme = createCustomBrandTheme({
      name: 'Night Test',
      organization: 'Test Org',
      primary: '#7b5cff',
      secondary: '#c8f04b',
      canvas: '#0d0d12',
      surface: '#1a1428',
    })
    expect(theme.colorScheme).toBe('dark')
    // --brand-foreground must be #ffffff so select text is legible against
    // the near-transparent dark background rendered by var(--brand-control)
    expect(theme.css?.['--brand-foreground']).toBe('#ffffff')
  })

  it('derives light colorScheme and dark foreground for a near-white surface', () => {
    const theme = createCustomBrandTheme({
      name: 'Day Test',
      organization: 'Test Org',
      primary: '#286b57',
      secondary: '#e0eee7',
      canvas: '#f7f6f0',
      surface: '#ffffff',
    })
    expect(theme.colorScheme).toBe('light')
    expect(theme.css?.['--brand-foreground']).toBe('#141414')
  })
})
