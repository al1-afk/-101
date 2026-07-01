/**
 * Extract images from a clipboard paste event and downscale/compress them
 * to a JPEG data URL suitable for embedding in a JSONB column.
 *
 * Max dimension 1600 px, JPEG quality 0.85 — a typical screenshot goes
 * from ~1.5 MB PNG to ~150-300 KB base64, small enough to store inline
 * without dedicated file storage.
 */

const MAX_DIM = 1600
const JPEG_QUALITY = 0.85

export function extractImageFilesFromClipboard(e: React.ClipboardEvent): File[] {
  const items = e.clipboardData?.items
  if (!items) return []
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) files.push(f)
    }
  }
  return files
}

export async function compressImageToDataURL(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const scale = Math.min(1, MAX_DIM / Math.max(width, height))
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}
