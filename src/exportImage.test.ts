import { describe, expect, it } from 'vitest'
import { getFooterQrSize } from './exportImage'

describe('branded export footer', () => {
  it('matches QR height to the rendered footer line count', () => {
    expect(getFooterQrSize(1, 4)).toBe(96)
    expect(getFooterQrSize(1, 5)).toBe(120)
  })

  it('scales the footer QR with high-density exports', () => {
    expect(getFooterQrSize(2, 4)).toBe(192)
    expect(getFooterQrSize(2, 5)).toBe(240)
  })
})
