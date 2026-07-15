import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Search, Loader2, MapPin, Phone, Globe, Building2, CheckCircle2, AlertCircle, ExternalLink, Sparkles, Mail, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useEnrichGooglePlaces, useOutboundSectors, useOutboundCampaigns, useOutboundIntegrationsStatus,
} from '@/hooks/useOutbound'
import { isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'

const SUGGESTIONS = [
  'boulangerie Oujda',
  'restaurants Casablanca centre',
  'cliniques dentaires Rabat',
  'auto-écoles Marrakech',
  'agences immobilières Tanger',
]

export default function OutboundEnrich() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { role } = useAuth()
  const canManageAll = isOutboundManager(role)

  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState<number>(10)
  const [sectorId, setSectorId] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [lastResult, setLastResult] = useState<
    | { imported: number; skipped: number; results: any[] }
    | null
  >(null)

  const { data: status } = useOutboundIntegrationsStatus()
  const { data: sectors = [] } = useOutboundSectors()
  const { data: campaigns = [] } = useOutboundCampaigns()
  const enrich = useEnrichGooglePlaces()

  const activeSectors = sectors.filter(s => s.actif !== false && !s.parent_id)
  const activeCampaigns = campaigns.filter(c => c.statut === 'active')

  const disabled = !query.trim() || !status?.google_places || enrich.isPending

  const submit = async () => {
    if (disabled) return
    const r = await enrich.mutateAsync({
      query: query.trim(),
      limit,
      sector_id: sectorId || undefined,
      campaign_id: campaignId || undefined,
    })
    setLastResult(r)
  }

  if (!canManageAll) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          L'enrichissement Google Places est réservé aux admins et managers.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-sky-600" />
            Prospecter via Google Places
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Recherche géolocalisée d'entreprises. Résultats importés directement dans <Link to={`/${tenantSlug}/outbound/prospects`} className="text-sky-600 hover:underline">vos prospects</Link>.
          </p>
        </div>
      </div>

      {!status?.google_places && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
          <p className="text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Google Places n'est pas configuré. Ajoute <code className="px-1 rounded bg-muted">GOOGLE_PLACES_API_KEY</code> dans <code className="px-1 rounded bg-muted">.env.local</code>, puis relance le serveur.
              Voir <Link to={`/${tenantSlug}/outbound/settings`} className="underline">Paramètres</Link>.
            </span>
          </p>
        </div>
      )}

      {/* Form */}
      <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Recherche</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder='Ex : "boulangerie Oujda", "cabinet dentaire Rabat"'
              className="pl-10"
              onKeyDown={e => { if (e.key === 'Enter' && !disabled) submit() }}
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-sky-500/40 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nombre max</label>
            <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 20].map(n => <SelectItem key={n} value={String(n)}>{n} résultats</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Secteur (optionnel)</label>
            <Select value={sectorId || '__none__'} onValueChange={v => setSectorId(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {activeSectors.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.couleur }} />
                      {s.nom}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Campagne (optionnel)</label>
            <Select value={campaignId || '__none__'} onValueChange={v => setCampaignId(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {activeCampaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Coût estimé : ~${(0.017 * 1).toFixed(3)} par recherche · Résultats dédupliqués par Google Place ID.
          </p>
          <Button onClick={submit} disabled={disabled} size="sm">
            {enrich.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Recherche…</>
              : <><Search className="w-3.5 h-3.5" /> Lancer</>}
          </Button>
        </div>
      </div>

      {/* Result */}
      {lastResult && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <p className="text-sm font-bold text-foreground">
                {lastResult.imported} importés · {lastResult.skipped} déjà présents
              </p>
            </div>
            <Link to={`/${tenantSlug}/outbound/prospects`}
                  className="text-xs font-semibold text-sky-600 hover:underline inline-flex items-center gap-1">
              Voir la liste <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          {lastResult.results.length > 0 && (() => {
            const withEmail = lastResult.results.filter(r => r.email).length
            const withWa    = lastResult.results.filter(r => r.whatsapp).length
            return (
              <>
                <div className="flex items-center gap-3 mb-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3 text-blue-500" />
                    {withEmail}/{lastResult.results.length} emails scrapés
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-3 h-3 text-green-500" />
                    {withWa}/{lastResult.results.length} WhatsApp détectés
                  </span>
                </div>
                <div className="space-y-2">
                  {lastResult.results.map(r => (
                    <Link key={r.id}
                          to={`/${tenantSlug}/outbound/prospects`}
                          className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--surface-card)] border border-border hover:border-sky-500/40 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-sky-500/15 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-sky-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{r.entreprise}</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                          {r.ville && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.ville}</span>}
                          {r.telephone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.telephone}</span>}
                          {r.whatsapp && <span className="flex items-center gap-1 text-green-600"><MessageCircle className="w-3 h-3" />WhatsApp</span>}
                          {r.email && <span className="flex items-center gap-1 text-blue-600"><Mail className="w-3 h-3" />{r.email}</span>}
                          {r.site_web && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{r.site_web.replace(/^https?:\/\//, '').slice(0, 30)}</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
