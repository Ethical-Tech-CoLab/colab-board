import { describe, expect, it } from 'vitest'
import { BRAND_THEMES } from './branding'

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
