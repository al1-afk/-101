/**
 * FacturePreview — Page A4 hôte du template Facture + actions Imprimer/PDF.
 * Route : /:tenantSlug/factures/:id/preview
 */
import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Copy, Check, Printer, Download } from 'lucide-react'

import { useFactures } from '@/hooks/useFactures'
import { useClients }  from '@/hooks/useClients'
import { Button }       from '@/components/ui/button'
import FactureTemplate  from '@/components/facture/FactureTemplate'
import { openPrint, buildPdfFilename } from '@/components/devis/DevisActions'

const A4_W_PX = 794
const A4_H_PX = 1123

export default function FacturePreview() {
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

  const { data: allFactures = [], isLoading: loadingFactures } = useFactures()
  const { data: allClients  = [], isLoading: loadingClients  } = useClients()

  const facture = allFactures.find(f => f.id === id)
  const client  = facture?.client_id ? allClients.find(c => c.id === facture.client_id) : undefined

  const loading = loadingFactures || loadingClients

  if (loading) return (
    <div className="flex items-center justify-center min-h-[100dvh]">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  )

  if (!facture) return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] gap-4">
      <p className="text-muted-foreground">Facture introuvable.</p>
      <Button variant="secondary" onClick={() => navigate(`/${tenantSlug}/factures`)}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Retour aux factures
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
            onClick={() => navigate(`/${tenantSlug}/factures`)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Retour
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block font-mono">
              {facture.numero}
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

            {(() => {
              const filename = buildPdfFilename({
                numero:     facture.numero,
                clientName: client?.entreprise ?? client?.nom ?? facture.client_nom,
                date:       facture.date_emission,
              })
              return <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { const e = templateRef.current; if (e) openPrint(e, filename, false) }}
                  className="flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span className="hidden sm:inline">Imprimer</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => { const e = templateRef.current; if (e) openPrint(e, filename, true) }}
                  className="flex items-center gap-2 bg-[#1e64c4] hover:bg-[#1558b0] text-white border-0"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Télécharger PDF</span>
                </Button>
              </>
            })()}
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
              <FactureTemplate ref={templateRef} facture={facture} client={client} />
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
