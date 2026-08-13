import QRCode from 'qrcode'

export const BOARD_SITE_URL =
  'https://ethical-tech-colab.github.io/ethical-tech-colab-board/'

function canvasAsPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The branded PNG could not be created.'))
    }, 'image/png')
  })
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
): string {
  if (context.measureText(text).width <= maximumWidth) return text
  let shortened = text
  while (
    shortened.length > 1 &&
    context.measureText(`${shortened}…`).width > maximumWidth
  ) {
    shortened = shortened.slice(0, -1)
  }
  return `${shortened}…`
}

function drawReturnQr(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const code = QRCode.create(BOARD_SITE_URL, { errorCorrectionLevel: 'M' })
  const quietZone = 2
  const moduleCount = code.modules.size + quietZone * 2
  const moduleSize = Math.max(1, Math.floor(size / moduleCount))
  const renderedSize = moduleCount * moduleSize
  const offsetX = x + Math.floor((size - renderedSize) / 2)
  const offsetY = y + Math.floor((size - renderedSize) / 2)

  context.fillStyle = '#ffffff'
  context.fillRect(offsetX, offsetY, renderedSize, renderedSize)
  context.fillStyle = '#171020'
  for (let row = 0; row < code.modules.size; row += 1) {
    for (let column = 0; column < code.modules.size; column += 1) {
      if (!code.modules.data[row * code.modules.size + column]) continue
      context.fillRect(
        offsetX + (column + quietZone) * moduleSize,
        offsetY + (row + quietZone) * moduleSize,
        moduleSize,
        moduleSize,
      )
    }
  }
}

export async function createBrandedPng(
  source: HTMLCanvasElement,
  boardTitle: string,
): Promise<Blob> {
  if (source.width <= 0 || source.height <= 0) {
    throw new Error('The canvas is not ready to export.')
  }

  const scale = Math.max(1, Math.min(2.5, source.width / 1_000))
  const footerHeight = Math.round(152 * scale)
  const margin = Math.round(14 * scale)
  const qrSize = footerHeight - margin * 2
  const output = document.createElement('canvas')
  output.width = source.width
  output.height = source.height + footerHeight
  const context = output.getContext('2d')
  if (!context) throw new Error('The export canvas could not be prepared.')

  context.drawImage(source, 0, 0)
  context.fillStyle = '#171020'
  context.fillRect(0, source.height, output.width, footerHeight)
  context.fillStyle = '#c8f04b'
  context.fillRect(0, source.height, output.width, Math.max(3, 4 * scale))

  const qrX = output.width - margin - qrSize
  const footerY = source.height
  drawReturnQr(context, qrX, footerY + margin, qrSize)

  const copyWidth = Math.max(80, qrX - margin * 2)
  context.textBaseline = 'top'
  context.fillStyle = '#c8f04b'
  context.font = `700 ${Math.round(13 * scale)}px "Space Mono", monospace`
  context.fillText('ETHICAL TECH COLAB · COLAB BOARD', margin, footerY + margin)

  context.fillStyle = '#ffffff'
  context.font = `700 ${Math.round(18 * scale)}px "Space Mono", monospace`
  context.fillText(
    fitText(context, boardTitle || 'Untitled thinking space', copyWidth),
    margin,
    footerY + margin + 23 * scale,
  )

  context.fillStyle = '#b9b2c7'
  context.font = `400 ${Math.round(10 * scale)}px "Space Mono", monospace`
  context.fillText('KEEP THINKING AT', margin, footerY + margin + 54 * scale)
  context.fillStyle = '#c8f04b'
  context.font = `700 ${Math.round(11 * scale)}px "Space Mono", monospace`
  const linkY = footerY + margin + 72 * scale
  if (context.measureText(BOARD_SITE_URL).width <= copyWidth) {
    context.fillText(BOARD_SITE_URL, margin, linkY)
  } else {
    let linkFontSize = Math.round(9 * scale)
    context.font = `700 ${linkFontSize}px "Space Mono", monospace`
    while (
      linkFontSize > 6 &&
      context.measureText('https://ethical-tech-colab.github.io/').width >
        copyWidth
    ) {
      linkFontSize -= 1
      context.font = `700 ${linkFontSize}px "Space Mono", monospace`
    }
    context.fillText('https://ethical-tech-colab.github.io/', margin, linkY)
    context.fillText(
      'ethical-tech-colab-board/',
      margin,
      linkY + 14 * scale,
    )
  }

  return canvasAsPng(output)
}
