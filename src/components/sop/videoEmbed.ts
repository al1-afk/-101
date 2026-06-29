export type VideoKind = 'youtube' | 'vimeo' | 'loom' | 'file' | 'unknown'

export interface VideoInfo {
  kind:      VideoKind
  embedUrl?: string
  thumbnail?:string
  rawUrl:    string
}

export function detectVideo(url: string): VideoInfo {
  const u = (url || '').trim()
  if (!u) return { kind: 'unknown', rawUrl: u }

  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i)
  if (yt) {
    const id = yt[1]
    return {
      kind:      'youtube',
      embedUrl:  `https://www.youtube.com/embed/${id}?rel=0`,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      rawUrl:    u,
    }
  }

  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i)
  if (vm) {
    const id = vm[1]
    return { kind: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}`, rawUrl: u }
  }

  const loom = u.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/i)
  if (loom) {
    const id = loom[1]
    return { kind: 'loom', embedUrl: `https://www.loom.com/embed/${id}`, rawUrl: u }
  }

  if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(u) || u.startsWith('data:video/')) {
    return { kind: 'file', embedUrl: u, rawUrl: u }
  }

  return { kind: 'unknown', rawUrl: u }
}
