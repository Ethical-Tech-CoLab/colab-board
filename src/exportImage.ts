import QRCode from 'qrcode'
import type { BrandTheme } from './branding'

export const BOARD_SITE_URL =
  'https://ethical-tech-colab.github.io/colab-board/'
const FOOTER_LINE_HEIGHT = 24

type ExportBrand = Pick<
  BrandTheme,
  'organization' | 'productName' | 'mark' | 'logoSrc'
>

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

export function getFooterQrSize(scale: number, lineCount: number): number {
  return Math.round(FOOTER_LINE_HEIGHT * scale * lineCount)
}

function loadBrandLogo(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error('The brand logo could not be loaded for export.'))
    image.src = src
  })
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const ratio = Math.min(
    width / image.naturalWidth,
    height / image.naturalHeight,
  )
  const renderedWidth = image.naturalWidth * ratio
  const renderedHeight = image.naturalHeight * ratio
  context.drawImage(
    image,
    x + (width - renderedWidth) / 2,
    y + (height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
  )
}

function drawBrandMark(
  context: CanvasRenderingContext2D,
  mark: string,
  x: number,
  y: number,
  size: number,
) {
  context.fillStyle = '#c8f04b'
  context.fillRect(x, y, size, size)
  context.fillStyle = '#171020'
  context.font = `700 ${Math.round(size * 0.34)}px "Space Mono", monospace`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(mark.slice(0, 3).toUpperCase(), x + size / 2, y + size / 2)
  context.textAlign = 'start'
  context.textBaseline = 'top'
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
  brand: ExportBrand,
): Promise<Blob> {
  if (source.width <= 0 || source.height <= 0) {
    throw new Error('The canvas is not ready to export.')
  }

  const scale = Math.max(1, Math.min(2.5, source.width / 1_000))
  const footerHeight = Math.round(152 * scale)
  const margin = Math.round(14 * scale)
  const logoSize = Math.round(56 * scale)
  const logo = brand.logoSrc ? await loadBrandLogo(brand.logoSrc) : null
  const logoWidth = logo
    ? Math.round(
        Math.min(
          112 * scale,
          logoSize * (logo.naturalWidth / logo.naturalHeight),
        ),
      )
    : logoSize
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

  const footerY = source.height
  const copyX = margin + logoWidth + Math.round(12 * scale)
  context.font = `700 ${Math.round(11 * scale)}px "Space Mono", monospace`
  let footerLineCount = 5
  let qrSize = getFooterQrSize(scale, footerLineCount)
  let qrX = output.width - margin - qrSize
  let copyWidth = Math.max(80, qrX - margin - copyX)
  if (context.measureText(BOARD_SITE_URL).width <= copyWidth) {
    footerLineCount = 4
    qrSize = getFooterQrSize(scale, footerLineCount)
    qrX = output.width - margin - qrSize
    copyWidth = Math.max(80, qrX - margin - copyX)
  }
  const contentY = footerY + margin
  drawReturnQr(context, qrX, contentY, qrSize)
  if (logo) {
    drawContainedImage(context, logo, margin, contentY, logoWidth, logoSize)
  } else {
    drawBrandMark(context, brand.mark, margin, contentY, logoSize)
  }

  context.textBaseline = 'top'
  context.fillStyle = '#c8f04b'
  context.font = `700 ${Math.round(13 * scale)}px "Space Mono", monospace`
  context.fillText(
    fitText(
      context,
      `${brand.organization} · ${brand.productName}`.toUpperCase(),
      copyWidth,
    ),
    copyX,
    contentY,
  )

  context.fillStyle = '#ffffff'
  context.font = `700 ${Math.round(18 * scale)}px "Space Mono", monospace`
  context.fillText(
    fitText(context, boardTitle || 'Untitled thinking space', copyWidth),
    copyX,
    footerY + margin + 23 * scale,
  )

  context.fillStyle = '#b9b2c7'
  context.font = `400 ${Math.round(10 * scale)}px "Space Mono", monospace`
  context.fillText('KEEP THINKING AT', copyX, footerY + margin + 54 * scale)
  context.fillStyle = '#c8f04b'
  context.font = `700 ${Math.round(11 * scale)}px "Space Mono", monospace`
  const linkY = footerY + margin + 72 * scale
  if (context.measureText(BOARD_SITE_URL).width <= copyWidth) {
    context.fillText(BOARD_SITE_URL, copyX, linkY)
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
    context.fillText('https://ethical-tech-colab.github.io/', copyX, linkY)
    context.fillText(
      'colab-board/',
      copyX,
      linkY + 14 * scale,
    )
  }

  return canvasAsPng(output)
}
