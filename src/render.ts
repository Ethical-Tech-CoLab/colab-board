import {
  getItemBounds,
  sparkleOffset,
  sparkleTrailHue,
} from './board'
import type { CanvasBrandTokens } from './branding'
import type {
  BoardItem,
  Camera,
  ImageItem,
  NoteItem,
  StrokeItem,
} from './types'

export type ImageCache = Map<string, HTMLImageElement>

interface DrawOptions {
  clear?: boolean
  background?: boolean
  grid?: boolean
  notes?: boolean
  selectedId?: string | null
  watermark?: string
  onImageLoad?: () => void
  theme?: CanvasBrandTokens
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: Camera,
  gridColor: string,
) {
  const minor = 24 * camera.scale
  const spacing = minor < 12 ? minor * 4 : minor
  const startX = ((camera.x % spacing) + spacing) % spacing
  const startY = ((camera.y % spacing) + spacing) % spacing

  context.save()
  context.strokeStyle = gridColor
  context.lineWidth = 1
  context.beginPath()
  for (let x = startX; x < width; x += spacing) {
    context.moveTo(Math.round(x) + 0.5, 0)
    context.lineTo(Math.round(x) + 0.5, height)
  }
  for (let y = startY; y < height; y += spacing) {
    context.moveTo(0, Math.round(y) + 0.5)
    context.lineTo(width, Math.round(y) + 0.5)
  }
  context.stroke()
  context.restore()
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: StrokeItem,
) {
  if (stroke.points.length === 0) return

  const sparkle = stroke.effect === 'sparkle'
  const seed = stroke.seed ?? 0
  const distances = [0]
  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1]
    const point = stroke.points[index]
    distances.push(
      distances[index - 1] + Math.hypot(point.x - previous.x, point.y - previous.y),
    )
  }
  const isDot = distances.at(-1)! < 0.01
  context.save()
  context.strokeStyle = stroke.color
  context.fillStyle = sparkle
    ? `hsl(${sparkleTrailHue(seed, 0)} 96% 62%)`
    : stroke.color
  context.globalAlpha = stroke.opacity
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (stroke.points.length === 1 || isDot) {
    const point = stroke.points[0]
    const radius = (stroke.width * Math.max(0.35, point.pressure)) / 2
    context.beginPath()
    context.arc(point.x, point.y, radius, 0, Math.PI * 2)
    context.fill()
  } else {
    for (let index = 1; index < stroke.points.length; index += 1) {
      const previous = stroke.points[index - 1]
      const point = stroke.points[index]
      context.lineWidth =
        stroke.width *
        Math.max(0.35, (previous.pressure + point.pressure) / 2)
      if (sparkle) {
        const gradient = context.createLinearGradient(
          previous.x,
          previous.y,
          point.x,
          point.y,
        )
        gradient.addColorStop(
          0,
          `hsl(${sparkleTrailHue(seed, distances[index - 1])} 96% 60%)`,
        )
        gradient.addColorStop(
          1,
          `hsl(${sparkleTrailHue(seed, distances[index])} 96% 60%)`,
        )
        context.strokeStyle = gradient
      } else {
        context.strokeStyle = stroke.color
      }
      context.beginPath()
      context.moveTo(previous.x, previous.y)
      context.lineTo(point.x, point.y)
      context.stroke()
    }
  }

  if (sparkle) {
    context.globalCompositeOperation = 'screen'
    if (isDot) {
      const point = stroke.points[0]
      const pressure = Math.max(0.35, point.pressure)
      for (let fleck = 0; fleck < 18; fleck += 1) {
        const angle = sparkleOffset(seed, fleck * 3) * Math.PI
        const distance =
          Math.sqrt(Math.abs(sparkleOffset(seed, fleck * 3 + 1))) *
          stroke.width *
          pressure *
          0.48
        const radius =
          0.3 + Math.abs(sparkleOffset(seed, fleck * 3 + 2)) * stroke.width * 0.045
        context.globalAlpha =
          stroke.opacity *
          (0.45 + Math.abs(sparkleOffset(seed, fleck * 3 + 3)) * 0.5)
        context.fillStyle = `hsl(${sparkleTrailHue(seed, fleck * 9)} 100% 88%)`
        context.beginPath()
        context.arc(
          point.x + Math.cos(angle) * distance,
          point.y + Math.sin(angle) * distance,
          radius,
          0,
          Math.PI * 2,
        )
        context.fill()
      }
    } else {
      const spacing = Math.max(1.8, stroke.width * 0.26)
      let sampleIndex = 0
      for (let index = 1; index < stroke.points.length; index += 1) {
        const previous = stroke.points[index - 1]
        const point = stroke.points[index]
        const deltaX = point.x - previous.x
        const deltaY = point.y - previous.y
        const length = Math.hypot(deltaX, deltaY)
        if (length < 0.01) continue
        const tangentX = deltaX / length
        const tangentY = deltaY / length
        const normalX = -tangentY
        const normalY = tangentX
        const steps = Math.max(1, Math.ceil(length / spacing))

        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps
          const pressure = Math.max(
            0.35,
            previous.pressure + (point.pressure - previous.pressure) * progress,
          )
          const distance = distances[index - 1] + length * progress
          for (let fleck = 0; fleck < 2; fleck += 1) {
            const randomIndex = sampleIndex * 7 + fleck * 31
            const across =
              sparkleOffset(seed, randomIndex) *
              stroke.width *
              pressure *
              0.43
            const along = sparkleOffset(seed, randomIndex + 1) * spacing * 0.34
            const radius =
              0.28 +
              Math.abs(sparkleOffset(seed, randomIndex + 2)) *
                stroke.width *
                0.045
            context.globalAlpha =
              stroke.opacity *
              (0.38 +
                Math.abs(sparkleOffset(seed, randomIndex + 3)) * 0.58)
            context.fillStyle = `hsl(${sparkleTrailHue(
              seed,
              distance + sparkleOffset(seed, randomIndex + 4) * 34,
            )} 100% 88%)`
            context.beginPath()
            context.arc(
              previous.x +
                deltaX * progress +
                tangentX * along +
                normalX * across,
              previous.y +
                deltaY * progress +
                tangentY * along +
                normalY * across,
              radius,
              0,
              Math.PI * 2,
            )
            context.fill()
          }
          sampleIndex += 1
        }
      }
    }
  }
  context.restore()
}

function imageFromCache(
  item: ImageItem,
  cache: ImageCache,
  onLoad?: () => void,
): HTMLImageElement {
  const cached = cache.get(item.src)
  if (cached) return cached

  const image = new Image()
  image.onload = () => onLoad?.()
  image.src = item.src
  cache.set(item.src, image)
  return image
}

function drawImage(
  context: CanvasRenderingContext2D,
  item: ImageItem,
  cache: ImageCache,
  onLoad?: () => void,
  placeholder = '#e9ede6',
) {
  const image = imageFromCache(item, cache, onLoad)
  context.save()
  context.shadowColor = 'rgba(29, 39, 34, 0.18)'
  context.shadowBlur = 18
  context.shadowOffsetY = 7
  if (image.complete && image.naturalWidth > 0) {
    context.drawImage(image, item.x, item.y, item.width, item.height)
  } else {
    context.fillStyle = placeholder
    context.fillRect(item.x, item.y, item.width, item.height)
  }
  context.restore()
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of (text || 'New thought').split('\n')) {
    const words = paragraph.split(/\s+/)
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    lines.push(line)
  }
  return lines
}

function drawNote(context: CanvasRenderingContext2D, note: NoteItem) {
  context.save()
  context.shadowColor = 'rgba(39, 48, 42, 0.16)'
  context.shadowBlur = 18
  context.shadowOffsetY = 8
  context.fillStyle = note.color
  context.beginPath()
  context.roundRect(note.x, note.y, note.width, note.height, 10)
  context.fill()
  context.shadowColor = 'transparent'
  context.fillStyle = '#25312b'
  context.font = '500 17px "Aptos", "Segoe UI", sans-serif'
  context.textBaseline = 'top'
  const lines = wrapText(context, note.text, note.width - 34)
  lines.slice(0, 7).forEach((line, index) => {
    context.fillText(line, note.x + 17, note.y + 28 + index * 23)
  })
  context.restore()
}

export function drawScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  items: BoardItem[],
  camera: Camera,
  imageCache: ImageCache,
  options: DrawOptions = {},
) {
  const theme = options.theme ?? {
    background: '#f7f6f0',
    grid: 'rgba(63, 76, 69, 0.09)',
    watermark: 'rgba(41, 56, 48, 0.42)',
    selection: '#22745d',
    imagePlaceholder: '#e9ede6',
  }
  if (options.clear !== false) context.clearRect(0, 0, width, height)
  if (options.background !== false) {
    context.fillStyle = theme.background
    context.fillRect(0, 0, width, height)
  }
  if (options.grid !== false) {
    drawGrid(context, width, height, camera, theme.grid)
  }

  context.save()
  context.translate(camera.x, camera.y)
  context.scale(camera.scale, camera.scale)
  for (const item of items) {
    if (item.type === 'stroke') drawStroke(context, item)
    if (item.type === 'image') {
      drawImage(
        context,
        item,
        imageCache,
        options.onImageLoad,
        theme.imagePlaceholder,
      )
    }
    if (item.type === 'note' && options.notes !== false) {
      drawNote(context, item)
    }
  }

  if (options.selectedId) {
    const selected = items.find((item) => item.id === options.selectedId)
    if (selected) {
      const bounds = getItemBounds(selected)
      context.strokeStyle = theme.selection
      context.lineWidth = 2 / camera.scale
      context.setLineDash([7 / camera.scale, 5 / camera.scale])
      context.strokeRect(bounds.x - 5, bounds.y - 5, bounds.width + 10, bounds.height + 10)
    }
  }
  context.restore()

  if (options.watermark) {
    context.save()
    context.fillStyle = theme.watermark
    context.font = '600 11px "Aptos", "Segoe UI", sans-serif'
    context.textAlign = 'right'
    context.fillText(options.watermark.toUpperCase(), width - 18, height - 18)
    context.restore()
  }
}
