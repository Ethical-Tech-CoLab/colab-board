export const PEN_ERASER_BUTTON = 5
export const PEN_ERASER_BUTTONS = 32
export const PEN_BARREL_BUTTON = 2
export const PEN_BARREL_BUTTONS = 2

export type PenButtonAction = 'tip' | 'eraser' | 'barrel' | 'none'

interface PointerButtonState {
  pointerType: string
  button: number
  buttons: number
}

export function getPenButtonAction(
  pointer: PointerButtonState,
): PenButtonAction {
  if (pointer.pointerType !== 'pen') return 'none'
  if (
    pointer.button === PEN_ERASER_BUTTON ||
    (pointer.buttons & PEN_ERASER_BUTTONS) !== 0
  ) {
    return 'eraser'
  }
  if (
    pointer.button === PEN_BARREL_BUTTON ||
    (pointer.buttons & PEN_BARREL_BUTTONS) !== 0
  ) {
    return 'barrel'
  }
  if (pointer.button === 0 || (pointer.buttons & 1) !== 0) return 'tip'
  return 'none'
}

export function getPointerPressure(pointer: {
  pointerType: string
  pressure: number
}): number {
  if (
    pointer.pointerType === 'pen' &&
    Number.isFinite(pointer.pressure) &&
    pointer.pressure > 0
  ) {
    return Math.min(1, pointer.pressure)
  }
  return 0.5
}
