import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private isChunkError(): boolean {
    const msg = this.state.error?.message ?? ''
    const name = this.state.error?.name ?? ''
    return /Failed to fetch dynamically imported module/i.test(msg)
      || /Loading chunk .* failed/i.test(msg)
      || /ChunkLoadError/i.test(name)
  }

  reset = () => {
    if (this.isChunkError() && typeof window !== 'undefined') {
      /* Old index.html referencing chunks that no longer exist after a
       * fresh deploy — force a hard reload to fetch the latest manifest. */
      window.location.reload()
      return
    }
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback

    const chunkError = this.isChunkError()
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-1">
          {chunkError ? 'Nouvelle version disponible' : 'Une erreur est survenue'}
        </h2>
        <p className="text-sm text-muted-foreground mb-1 max-w-sm">
          {chunkError
            ? "L'application vient d'être mise à jour. Recharge la page pour continuer."
            : 'Cette page a rencontré un problème inattendu.'}
        </p>
        {!chunkError && this.state.error && (
          <p className="text-xs font-mono text-muted-foreground bg-muted px-3 py-1 rounded mb-4 max-w-sm truncate">
            {this.state.error.message}
          </p>
        )}
        <Button onClick={this.reset} size="sm" className="gap-2 mt-3">
          <RefreshCcw className="w-4 h-4" /> {chunkError ? 'Recharger' : 'Réessayer'}
        </Button>
      </div>
    )
  }
}
