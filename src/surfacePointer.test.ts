import { describe, expect, it } from 'vitest'
import {
  getPenButtonAction,
  getPointerPressure,
  PEN_BARREL_BUTTONS,
  PEN_ERASER_BUTTONS,
} from './surfacePointer'

describe('Surface Pen pointer intent', () => {
  it('recognizes the rear eraser from its button and buttons bitmask', () => {
    expect(
      getPenButtonAction({ pointerType: 'pen', button: 5, buttons: 0 }),
    ).toBe('eraser')
    expect(
      getPenButtonAction({
        pointerType: 'pen',
        button: -1,
        buttons: PEN_ERASER_BUTTONS,
      }),
    ).toBe('eraser')
  })

  it('recognizes the barrel button without treating it as a pen tip', () => {
    expect(
      getPenButtonAction({ pointerType: 'pen', button: 2, buttons: 0 }),
    ).toBe('barrel')
    expect(
      getPenButtonAction({
        pointerType: 'pen',
        button: -1,
        buttons: PEN_BARREL_BUTTONS,
      }),
    ).toBe('barrel')
  })

  it('does not classify mouse or touch buttons as pen actions', () => {
    expect(
      getPenButtonAction({ pointerType: 'mouse', button: 0, buttons: 1 }),
    ).toBe('none')
    expect(
      getPenButtonAction({ pointerType: 'touch', button: 0, buttons: 1 }),
    ).toBe('none')
  })

  it('preserves supported pen pressure and supplies a stable fallback', () => {
    expect(getPointerPressure({ pointerType: 'pen', pressure: 0.72 })).toBe(
      0.72,
    )
    expect(getPointerPressure({ pointerType: 'pen', pressure: 0 })).toBe(0.5)
    expect(getPointerPressure({ pointerType: 'mouse', pressure: 0 })).toBe(0.5)
  })
})
