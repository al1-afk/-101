/**
 * BonLivraisonPreview — Page A4 hôte du template + actions (impression / PDF).
 * Route : /:tenantSlug/bons-livraison/:id/preview
 */
import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Copy, Check, Printer, Download } from 'lucide-react'

import { useBonsLivraison } from '@/hooks/useBonsLivraison'
import { useClients }       from '@/hooks/useClients'
import { useProjets }       from '@/hooks/useProjets'
import { Button } from '@/components/ui/button'
import BonLivraisonTemplate from '@/components/bons-livraison/BonLivraisonTemplate'
import { openPrint } from '@/components/devis/DevisActions'

const A4_W_PX = 794
const A4_H_PX = 1123

export default function BonLivraisonPreview() {
  const { id, tenantSlug } = useParams<{ id: string; tenantSlug: string }>()
  const navigate     = useNavigate()
  const templateRef  = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [scale, setScale]   = useState(1)
  const [pages, setPages]   = useState(1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const avail = el.clientWidth - 32
      setScale(Math.min(1, avail / A4_W_PX))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = templateRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setPages(Math.max(1, Math.ceil(el.scrollHeight / A4_H_PX)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const { data: allBons = [],    isLoading: loadingBons    } = useBonsLivraison()
  const { data: allClients = [], isLoading: loadingClients } = useClients()
  const { data: allProjets = [], isLoading: loadingProjets } = useProjets()

  const bon    = allBons.find(b => b.id === id)
  const client = bon?.client_id ? allClients.find(c => c.id === bon.client_id) : undefined
  const projet = bon?.projet_id ? allProjets.find(p => p.id === bon.projet_id) : undefined

  const loading = loadingBons || loadingClients || loadingProjets

  if (loading) return (
    <div className="flex items-center justify-center min-h-[100dvh]">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
    </div>
  )

  if (!bon) return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] gap-4">
      <p className="text-muted-foreground">Bon de livraison introuvable.</p>
      <Button variant="secondary" onClick={() => navigate(`/${tenantSlug}/bons-livraison`)}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Retour aux bons de livraison
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-100 dark:bg-slate-900 overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm px-5 py-3">
        <div className="max-w-[230mm] mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/${tenantSlug}/bons-livraison`)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Retour
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block font-mono">
              {bon.numero}
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={copyLink}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              {copied
                ? <><Check className="w-4 h-4 text-green-500" /><span className="text-green-500 text-xs">Copié !</span></>
                : <><Copy className="w-4 h-4" /><span className="text-xs hidden sm:inline">Copier le lien</span></>
              }
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => { const e = templateRef.current; if (e) openPrint(e, bon.numero, false) }}
              className="flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimer</span>
            </Button>

            <Button
              size="sm"
              onClick={() => { const e = templateRef.current; if (e) openPrint(e, bon.numero, true) }}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Télécharger PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Scrollable A4 area ───────────────────────────────── */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <div className="py-6 md:py-8 px-4 flex justify-center">
          <div
            style={{
              width:  A4_W_PX * scale,
              height: A4_H_PX * scale * pages,
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <div
              style={{
                width:           A4_W_PX,
                transformOrigin: 'top left',
                transform:       `scale(${scale})`,
                boxShadow:       '0 4px 40px rgba(0,0,0,0.18)',
                borderRadius:    '4px',
                overflow:        'hidden',
                background:      'white',
              }}
            >
              <BonLivraisonTemplate ref={templateRef} bon={bon} client={client} projet={projet} />
            </div>
            {Array.from({ length: pages - 1 }).map((_, i) => (
              <div
                key={i}
                style={{
                  position:   'absolute',
                  left:       0,
                  right:      0,
                  top:        A4_H_PX * scale * (i + 1),
                  height:     2,
                  background: '#94a3b8',
                  zIndex:     10,
                }}
              />
            ))}
          </div>
        </div>
        {pages > 1 && (
          <div className="text-center text-xs text-slate-500 dark:text-slate-400 pb-3">
            {pages} pages
          </div>
        )}
        <div className="h-12" />
      </div>
    </div>
  )
}
