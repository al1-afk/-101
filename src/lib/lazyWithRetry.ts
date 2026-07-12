import { lazy, type ComponentType } from 'react'

/**
 * lazy() wrapper that self-heals after a fresh deploy.
 *
 *  Problem : Vite chunks are content-hashed. When a new build ships,
 *  the browser still holds the *old* index.html referencing chunks that
 *  no longer exist → `Failed to fetch dynamically imported module: …`.
 *
 *  Fix : when the dynamic import fails, force a hard reload of index.html
 *  (once per session — guarded by sessionStorage to avoid infinite loops).
 */
const RELOAD_FLAG = '__nextgital_chunk_reloaded__'

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    try {
      return await factory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isChunkError =
        /Failed to fetch dynamically imported module/i.test(msg) ||
        /Loading chunk .* failed/i.test(msg) ||
        /ChunkLoadError/i.test(err instanceof Error ? err.name : '')

      if (isChunkError && typeof window !== 'undefined') {
        const already = window.sessionStorage.getItem(RELOAD_FLAG)
        if (!already) {
          window.sessionStorage.setItem(RELOAD_FLAG, '1')
          window.location.reload()
          /* Return a never-resolving promise so React keeps the Suspense
             boundary up while the page reloads. */
          return await new Promise<{ default: T }>(() => {})
        }
      }
      throw err
    }
  })
}
