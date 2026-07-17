import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Mail, Bot, Loader2, Smartphone, Monitor, Copy, ExternalLink, Palette, Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAutopilotEmailPreview } from '@/hooks/useOutbound'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { isOutboundManager } from './utils'

const SERVICE_PRESETS = [
  'ERP sur-mesure',
  'Site web performant',
  'Modules IA',
  'Marketing IA',
]

export default function OutboundAutopilotEmailPreview() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { role } = useAuth()
  const canManageAll = isOutboundManager(role)

  const [lang,    setLang]    = useState<'fr' | 'ar' | 'en'>('fr')
  const [service, setService] = useState<string>('ERP sur-mesure')
  const [company, setCompany] = useState<string>('Boulangerie Al Andalous')
  const [contact, setContact] = useState<string>('Ahmed Bennani')
  const [city,    setCity]    = useState<string>('Oujda')
  const [device,  setDevice]  = useState<'desktop' | 'mobile'>('desktop')

  const { data, isFetching } = useAutopilotEmailPreview({ lang, service, company, contact, city })

  const iframeSrc = useMemo(() => {
    if (!data?.html) return ''
    return 'data:text/html;charset=utf-8,' + encodeURIComponent(data.html)
  }, [data?.html])

  const copySubject = () => {
    if (!data?.subject) return
    navigator.clipboard.writeText(data.subject)
    toast.success('Objet copié')
  }
  const copyBody = () => {
    if (!data?.body) return
    navigator.clipboard.writeText(data.body)
    toast.success('Corps copié')
  }

  if (!canManageAll) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          L'aperçu du template email est réservé aux admins et managers.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex-1">
          <h1 className="page-title flex items-center gap-2">
            <Mail className="w-6 h-6 text-blue-600" />
            Aperçu du template email
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Prévisualisation exacte du rendu envoyé par l'Autopilot. Modifie les paramètres à droite pour tester différents scénarios.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/${tenantSlug}/outbound/autopilot`}>
            <Button variant="secondary" size="sm">
              <Settings className="w-3.5 h-3.5" /> Configuration
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => {
            if (!data?.html) return
            const win = window.open('', '_blank')
            if (win) { win.document.write(data.html); win.document.close() }
          }} disabled={!data}>
            <ExternalLink className="w-3.5 h-3.5" /> Ouvrir dans un onglet
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Contrôles */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-[var(--surface-card)] p-4 space-y-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase">Scénario</h2>
            <Field label="Langue">
              <Select value={lang} onValueChange={v => setLang(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">🇫🇷 Français</SelectItem>
                  <SelectItem value="ar">🇲🇦 العربية</SelectItem>
                  <SelectItem value="en">🇬🇧 English</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Service proposé">
              <Select value={service} onValueChange={setService}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_PRESETS.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input className="mt-2" value={service} onChange={e => setService(e.target.value)} placeholder="Ou saisir un service…" />
            </Field>
            <Field label="Entreprise du prospect">
              <Input value={company} onChange={e => setCompany(e.target.value)} />
            </Field>
            <Field label="Nom du contact">
              <Input value={contact} onChange={e => setContact(e.target.value)} />
            </Field>
            <Field label="Ville">
              <Input value={city} onChange={e => setCity(e.target.value)} />
            </Field>
          </section>

          <section className="rounded-2xl border border-border bg-[var(--surface-card)] p-4 space-y-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase">Vue</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDevice('desktop')}
                className={`text-xs font-semibold py-2 rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  device === 'desktop' ? 'border-blue-500 bg-blue-500/10 text-blue-700' : 'border-border text-muted-foreground'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" /> Desktop
              </button>
              <button
                onClick={() => setDevice('mobile')}
                className={`text-xs font-semibold py-2 rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  device === 'mobile' ? 'border-blue-500 bg-blue-500/10 text-blue-700' : 'border-border text-muted-foreground'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" /> Mobile
              </button>
            </div>
          </section>

          {data && (
            <section className="rounded-2xl border border-border bg-[var(--surface-card)] p-4 space-y-2">
              <h2 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                <Palette className="w-3 h-3" /> Design actuel
              </h2>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Couleur : <span className="inline-block w-3 h-3 rounded-full align-middle" style={{ background: '#4F46E5' }} /> Indigo</li>
                <li>• Largeur : 560 px</li>
                <li>• Header avec logo/initiales</li>
                <li>• Signature + coordonnées</li>
                <li>• Footer + désinscription</li>
              </ul>
            </section>
          )}
        </div>

        {/* Preview */}
        <div className="space-y-3">
          {/* Meta (objet + expéditeur → destinataire) */}
          <div className="rounded-xl border border-border bg-[var(--surface-card)] p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold">Objet</p>
                <p className="text-sm font-bold text-foreground truncate">
                  {isFetching ? <span className="text-muted-foreground italic">Génération…</span> : data?.subject ?? '—'}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={copySubject} disabled={!data}>
                <Copy className="w-3 h-3" /> Copier
              </Button>
            </div>
            {data && (
              <p className="text-[11px] text-muted-foreground">
                De <b>{data.sender.name}</b> ({data.sender.email}) → à <b>{data.sample.email}</b>
              </p>
            )}
          </div>

          {/* Iframe */}
          <div className="rounded-2xl border border-border bg-[#F3F4F6] dark:bg-slate-900 p-4 min-h-[600px] flex justify-center">
            {isFetching && !data ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
              </div>
            ) : data?.html ? (
              <iframe
                title="Aperçu email"
                src={iframeSrc}
                sandbox=""
                className="bg-white rounded-xl shadow-sm w-full"
                style={{
                  width:  device === 'mobile' ? '380px' : '100%',
                  maxWidth: device === 'mobile' ? '380px' : '640px',
                  height: '780px',
                  border: 'none',
                }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Aucun aperçu disponible.</p>
            )}
          </div>

          {/* Version texte */}
          {data && (
            <details className="rounded-xl border border-border bg-[var(--surface-card)] p-4">
              <summary className="text-xs font-bold text-muted-foreground uppercase cursor-pointer">
                Version texte brut (fallback plain-text)
              </summary>
              <div className="mt-3 flex items-start gap-2">
                <pre className="flex-1 text-xs text-foreground whitespace-pre-wrap font-mono">{data.body}</pre>
                <Button variant="secondary" size="sm" onClick={copyBody}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </details>
          )}

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Bot className="w-3 h-3" />
            <span>
              Texte d'exemple statique — dans la vraie campagne, Claude/OpenAI génère un contenu unique pour chaque prospect.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}
