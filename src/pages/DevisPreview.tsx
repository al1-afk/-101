/**
 * DevisPreview — Full page that hosts the A4 template + action buttons.
 * Route: /devis/:id/preview
 */
import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import { ArrowLeft, Loader2, Copy, Check } from 'lucide-react'

/* A4 document is 210mm × 297mm ≈ 794 × 1123 px @ 96 dpi. The template
   itself is rendered at this fixed width; the wrapper scales it down
   to fit narrower viewports (phones) while keeping the document
   pixel-accurate for PDF export via templateRef. */
const A4_W_PX = 794
const A4_H_PX = 1123
import { useDevis }   from '@/hooks/useDevis'
import { useClients } from '@/hooks/useClients'
import { Button }      from '@/components/ui/button'
import DevisTemplate   from '@/components/devis/DevisTemplate'
import DevisActions, { buildPdfFilename } from '@/components/devis/DevisActions'

export default function DevisPreview() {
  const { id, tenantSlug } = useParams<{ id: string; tenantSlug: string }>()
  const navigate    = useNavigate()
  const templateRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [scale, setScale] = useState(1)
  const [pages, setPages] = useState(1)

  /* Recompute scale whenever the scroll container resizes. */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const avail = el.clientWidth - 32  // 16px padding each side
      setScale(Math.min(1, avail / A4_W_PX))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* Recompute page count whenever the document height changes. */
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

  const { data: allDevis = [],   isLoading: loadingDevis   } = useDevis()
  const { data: allClients = [], isLoading: loadingClients } = useClients()

  const devis  = allDevis.find(d => d.id === id)
  const client = devis ? allClients.find(c => c.id === devis.client_id) : undefined

  const loading = loadingDevis || loadingClients

  /* ── Loading ── */
  if (loading) return (
    <div className="flex items-center justify-center min-h-[100dvh]">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
    </div>
  )

  /* ── Not found ── */
  if (!devis) return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] gap-4">
      <p className="text-muted-foreground">Devis introuvable.</p>
      <Button variant="secondary" onClick={() => navigate(`/${tenantSlug}/devis`)}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Retour aux devis
      </Button>
    </div>
  )

  return (
    /* Page background */
    <div className="flex flex-col h-[100dvh] bg-slate-100 dark:bg-slate-900 overflow-hidden">

      {/* ── Top bar (fixed) ──────────────────────────────── */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm px-5 py-3">
        <div className="max-w-[230mm] mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/${tenantSlug}/devis`)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Retour
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block font-mono">
              {devis.numero}
            </span>

            {/* Copy link */}
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

            <DevisActions
              templateRef={templateRef}
              filename={buildPdfFilename({
                numero:     devis.numero,
                clientName: client?.entreprise ?? client?.nom ?? devis.client_nom,
                date:       devis.date_emission,
              })}
            />
          </div>
        </div>
      </div>

      {/* ── Scrollable A4 area ──────────────────────────────
          The template itself is rendered at A4 pixel width
          (templateRef → PDF export needs full resolution); the
          wrapper scales it down via CSS transform to fit narrow
          viewports, with the outer box sized to the scaled height
          so layout stays correct. */}
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
              <DevisTemplate ref={templateRef} devis={devis} client={client} />
            </div>
            {/* Page-break separators */}
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
