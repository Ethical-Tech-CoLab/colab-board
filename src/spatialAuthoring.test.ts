import { describe, expect, it } from 'vitest'
import {
  getSpatialInputAction,
  spatialItemVersion,
  spatialLayerOffset,
  spatialPlaneZ,
  spatialTransformAtDepth,
  spatialWorldToBoardPoint,
} from './spatialAuthoring'
import type { NoteItem } from './types'

describe('spatial authoring input', () => {
  it('keeps Surface Pen tip, rear eraser, and barrel actions distinct', () => {
    expect(
      getSpatialInputAction(
        { pointerType: 'pen', button: 0, buttons: 1 },
        'pen',
        'pan',
      ),
    ).toBe('draw')
    expect(
      getSpatialInputAction(
        { pointerType: 'pen', button: 5, buttons: 32 },
        'pen',
        'pan',
      ),
    ).toBe('erase')
    expect(
      getSpatialInputAction(
        { pointerType: 'pen', button: 2, buttons: 2 },
        'pen',
        'pan',
      ),
    ).toBe('navigate')
  })

  it('respects touch navigation while allowing explicit touch drawing', () => {
    const touch = { pointerType: 'touch', button: 0, buttons: 1 }
    expect(getSpatialInputAction(touch, 'pen', 'pan')).toBe('navigate')
    expect(getSpatialInputAction(touch, 'pen', 'draw')).toBe('draw')
  })

  it('maps the shared toolbar to native Spatial actions', () => {
    const mouse = { pointerType: 'mouse', button: 0, buttons: 1 }
    expect(getSpatialInputAction(mouse, 'note', 'pan')).toBe('note')
    expect(getSpatialInputAction(mouse, 'eraser', 'pan')).toBe('erase')
    expect(getSpatialInputAction(mouse, 'select', 'pan')).toBe('select')
    expect(getSpatialInputAction(mouse, 'pan', 'pan')).toBe('navigate')
  })

  it('maps a work plane back to stable board coordinates', () => {
    expect(spatialPlaneZ(40)).toBeCloseTo(0.4)
    expect(spatialLayerOffset('stroke-one')).toBe(
      spatialLayerOffset('stroke-one'),
    )
    expect(spatialLayerOffset('stroke-one')).not.toBe(
      spatialLayerOffset('stroke-two'),
    )
    expect(spatialTransformAtDepth(900).depth).toBe(500)
    expect(spatialWorldToBoardPoint({ x: 1.2, y: -0.8 }, { x: 50, y: 70 })).toEqual({
      x: 170,
      y: 150,
    })
  })

  it('changes item versions only when rendered content changes', () => {
    const note: NoteItem = {
      id: 'note-1',
      type: 'note',
      x: 20,
      y: 30,
      width: 240,
      height: 176,
      text: 'Original',
      color: '#ffe39a',
      createdAt: 1,
    }
    expect(spatialItemVersion({ ...note })).toBe(spatialItemVersion(note))
    expect(spatialItemVersion({ ...note, text: 'Updated' })).not.toBe(
      spatialItemVersion(note),
    )
    expect(
      spatialItemVersion({
        ...note,
        spatial: spatialTransformAtDepth(50),
      }),
    ).not.toBe(spatialItemVersion(note))
  })
})
