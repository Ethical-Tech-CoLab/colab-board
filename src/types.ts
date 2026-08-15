export type Tool =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'note'
  | 'pan'

export type ScreensaverMode =
  | 'replay'
  | 'drift'
  | 'galaxy'
  | 'aurora'
  | 'constellation'
  | 'terminal'
  | 'snake'
  | 'water'
export type ReplayStyle =
  | 'exact'
  | 'accelerated'
  | 'artistic'
  | 'ghosts'
  | 'evolution'
export type ReplayEndEffect =
  | 'fade-white'
  | 'fade-black'
  | 'particles'
  | 'blueprint'
  | 'glitch'
  | 'evaporate'
export type BrandThemeId =
  | 'ethical-tech'
  | 'garage'
  | 'garage-colab'
  | 'studio'
  | 'signal'
  | 'ocean'
  | 'sunrise'
  | 'custom'
export type InkStyle = 'solid' | 'sparkle'
export type TouchMode = 'pan' | 'draw'
export type DialMode = 'zoom' | 'ink-size'
export type SceneMode = 'canvas' | 'spatial'
export type PerspectiveGuide = 'none' | 'grid' | 'one-point' | 'two-point'

export interface SpatialTransform {
  depth: number
  rotationX: number
  rotationY: number
  rotationZ: number
  scale: number
}

export interface Point {
  x: number
  y: number
  pressure: number
  t: number
}

interface ItemBase {
  id: string
  createdAt: number
  spatial?: SpatialTransform
}

export interface StrokeItem extends ItemBase {
  type: 'stroke'
  points: Point[]
  color: string
  width: number
  opacity: number
  duration: number
  effect?: 'sparkle'
  seed?: number
}

export interface NoteItem extends ItemBase {
  type: 'note'
  x: number
  y: number
  width: number
  height: number
  text: string
  color: string
}

export interface ImageItem extends ItemBase {
  type: 'image'
  x: number
  y: number
  width: number
  height: number
  src: string
  name: string
  opacity?: number
}

export type BoardItem = StrokeItem | NoteItem | ImageItem

export interface Camera {
  x: number
  y: number
  scale: number
}

export type TimelineEvent =
  | {
      id: string
      type: 'add' | 'update'
      at: number
      item: BoardItem
    }
  | {
      id: string
      type: 'delete'
      at: number
      itemId: string
    }
  | {
      id: string
      type: 'clear'
      at: number
    }
  | {
      id: string
      type: 'camera'
      at: number
      camera: Camera
    }

export interface BoardDocument {
  version: 1
  id: string
  title: string
  author: string
  createdAt: number
  updatedAt: number
  watermark: string
  items: BoardItem[]
  timeline: TimelineEvent[]
}

export interface Preferences {
  color: string
  strokeWidth: number
  idleMinutes: number
  screensaverMode: ScreensaverMode
  replayStyle: ReplayStyle
  replayEndEffect: ReplayEndEffect
  brandTheme: BrandThemeId
  sceneMode: SceneMode
  perspectiveGuide: PerspectiveGuide
  inkStyle: InkStyle
  overlayOpacity: number
  touchMode: TouchMode
  dialMode: DialMode
}

export type SaveState = 'loading' | 'saving' | 'saved' | 'error'
