/**
 * Onglet "Infos & Accès" du projet (admin).
 * 3 sections : Notes client · Identifiants · Liens utiles.
 * Sauvegarde dans projet.notes JSON (envelope projetNotes).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, KeyRound, Link2, FileText, Phone, Mail, MapPin, Building2,
  Loader2, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import PasswordField from '@/components/PasswordField'
import { projetsApi } from '@/lib/api'
import { parseProjet, serializeProjet, CREDENTIAL_PRESETS, type Credential, type UsefulLink } from '@/lib/projetNotes'
import type { Projet } from '@/hooks/useProjets'
import type { Client } from '@/hooks/useClients'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }

interface Props {
  projet: Projet
  client?: Client
}

export default function InfosAccesTab({ projet, client }: Props) {
  const initial = useMemo(() => parseProjet(projet.notes), [projet.notes])
  const [infos,       setInfos]       = useState(initial.infos)
  const [credentials, setCredentials] = useState<Credential[]>(initial.credentials)
  const [links,       setLinks]       = useState<UsefulLink[]>(initial.usefulLinks)
  const [saveState,   setSaveState]   = useState<'idle' | 'saving' | 'saved'>('idle')

  const lastSerialized = useRef<string>(projet.notes ?? '')
  const qc = useQueryClient()

  /* Reset when project changes */
  useEffect(() => {
    setInfos(initial.infos)
    setCredentials(initial.credentials)
    setLinks(initial.usefulLinks)
    lastSerialized.current = projet.notes ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projet.id])

  /* Auto-save 800 ms debounce */
  useEffect(() => {
    const next = serializeProjet({
      ...initial,
      infos, credentials, usefulLinks: links,
    })
    if (next === lastSerialized.current) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        await projetsApi.update(projet.id, { notes: next })
        lastSerialized.current = next
        qc.invalidateQueries({ queryKey: ['projets'] })
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1500)
      } catch (e: any) {
        toast.error(e?.message ?? 'Erreur de sauvegarde')
        setSaveState('idle')
      }
    }, 800)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infos, credentials, links])

  const addCredential = (preset?: typeof CREDENTIAL_PRESETS[number]) => {
    setCredentials(p => [...p, {
      id: uid(),
      label: preset?.label ?? '',
      type:  preset?.type  ?? 'custom',
      url:   preset?.urlHint ?? '',
      username: '',
      password: '',
      notes: '',
    }])
  }
  const updateCred = (id: string, patch: Partial<Credential>) =>
    setCredentials(p => p.map(c => c.id === id ? { ...c, ...patch } : c))
  const removeCred = (id: string) => setCredentials(p => p.filter(c => c.id !== id))

  const addLink = () => setLinks(p => [...p, { id: uid(), label: '', url: '', notes: '' }])
  const updateLink = (id: string, patch: Partial<UsefulLink>) =>
    setLinks(p => p.map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLink = (id: string) => setLinks(p => p.filter(l => l.id !== id))

  return (
    <div className="space-y-4">
      {/* Save indicator */}
      <div className="flex items-center justify-end">
        <span className={cn(
          'text-[11px] font-medium',
          saveState === 'saving' && 'text-amber-500',
          saveState === 'saved'  && 'text-emerald-600 dark:text-emerald-400',
          saveState === 'idle'   && 'text-muted-foreground',
        )}>
          {saveState === 'saving' && '💾 Enregistrement…'}
          {saveState === 'saved'  && '✓ Enregistré'}
          {saveState === 'idle'   && 'Sauvegarde auto'}
        </span>
      </div>

      {/* ── Contact client (lecture seule, depuis client) ── */}
      {client && (
        <div className="card-premium p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-bold text-foreground uppercase tracking-widest">Contact client</p>
            <span className="text-[11px] text-muted-foreground italic ml-auto">depuis la fiche client</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Info label="Entreprise" value={client.entreprise ?? client.nom ?? '—'} icon={Building2} />
            <Info label="Contact" value={client.nom ?? '—'} />
            <Info label="Téléphone" value={client.telephone ?? '—'} icon={Phone} copy />
            <Info label="Email" value={client.email ?? '—'} icon={Mail} copy />
            {(client.adresse || client.ville) && (
              <Info label="Adresse" value={[client.adresse, client.ville, client.pays].filter(Boolean).join(', ')} icon={MapPin} className="md:col-span-2" />
            )}
          </div>
        </div>
      )}

      {/* ── Notes client / projet ── */}
      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-500" />
          <p className="text-xs font-bold text-foreground uppercase tracking-widest">Notes client / projet</p>
        </div>
        <AutocorrectTextarea
          value={infos}
          onChange={e => setInfos(e.target.value)}
          placeholder="Préférences, attentes, contraintes spécifiques, contexte… (sera visible par tous les membres assignés)"
          rows={4}
          className="w-full rounded-lg border border-border bg-[var(--surface-input)] px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-blue-400 resize-y"
        />
      </div>

      {/* ── Identifiants ── */}
      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-bold text-foreground uppercase tracking-widest">
              Identifiants ({credentials.length})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value="" onValueChange={(v) => {
              const preset = CREDENTIAL_PRESETS.find(p => p.type === v)
              if (preset) addCredential(preset)
            }}>
              <SelectTrigger className="h-8 text-xs w-auto gap-1">
                <Sparkles className="w-3 h-3" />
                <SelectValue placeholder="Preset rapide…" />
              </SelectTrigger>
              <SelectContent>
                {CREDENTIAL_PRESETS.map(p => (
                  <SelectItem key={p.type} value={p.type}>{p.emoji} {p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="secondary" onClick={() => addCredential()}>
              <Plus className="w-3.5 h-3.5" /> Vide
            </Button>
          </div>
        </div>

        {credentials.length === 0 ? (
          <div className="empty-state py-8 border-2 border-dashed border-border rounded-xl">
            <KeyRound className="empty-state-icon" />
            <p className="empty-state-title">Aucun identifiant</p>
            <p className="empty-state-desc">Utilise un preset (WordPress, cPanel, etc.) ou ajoute manuellement</p>
          </div>
        ) : (
          <div className="space-y-2">
            {credentials.map(c => (
              <CredentialCard
                key={c.id}
                cred={c}
                onUpdate={p => updateCred(c.id, p)}
                onRemove={() => removeCred(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Liens utiles ── */}
      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-emerald-500" />
            <p className="text-xs font-bold text-foreground uppercase tracking-widest">
              Liens utiles ({links.length})
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={addLink}>
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </Button>
        </div>

        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 text-center py-3">
            Drive, Figma, Notion, WhatsApp, etc.
          </p>
        ) : (
          <div className="space-y-2">
            {links.map(l => (
              <div key={l.id} className="flex items-center gap-2">
                <AutocorrectInput
                  value={l.label}
                  onChange={e => updateLink(l.id, { label: e.target.value })}
                  placeholder="Label (ex. Drive client)"
                  className="h-8 text-sm w-48 flex-shrink-0"
                />
                <Input
                  value={l.url}
                  onChange={e => updateLink(l.id, { url: e.target.value })}
                  placeholder="https://..."
                  className="h-8 text-sm font-mono text-xs flex-1"
                />
                {l.url && (
                  <a href={l.url} target="_blank" rel="noreferrer"
                    className="p-1.5 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    title="Ouvrir"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </a>
                )}
                <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-500"
                  onClick={() => removeLink(l.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────── */
function Info({ label, value, icon: Icon, copy, className }: {
  label:    string
  value:    string
  icon?:    React.ElementType
  copy?:    boolean
  className?: string
}) {
  const doCopy = async () => {
    if (!value || value === '—') return
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`✓ ${label} copié`)
    } catch {}
  }
  return (
    <div className={cn('flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/20', className)}>
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate">{value}</p>
      </div>
      {copy && value !== '—' && (
        <button onClick={doCopy} className="p-1 rounded text-muted-foreground hover:text-blue-500" title="Copier">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      )}
    </div>
  )
}

function CredentialCard({ cred, onUpdate, onRemove }: {
  cred:    Credential
  onUpdate:(p: Partial<Credential>) => void
  onRemove:() => void
}) {
  const preset = CREDENTIAL_PRESETS.find(p => p.type === cred.type) ?? CREDENTIAL_PRESETS.find(p => p.type === 'custom')!
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base flex-shrink-0">{preset.emoji}</span>
        <AutocorrectInput
          value={cred.label}
          onChange={e => onUpdate({ label: e.target.value })}
          placeholder="Label (ex. WordPress Admin)"
          className="h-7 text-sm font-semibold border-transparent shadow-none focus:border-border"
        />
        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-500"
          onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-7">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">URL</label>
          <Input value={cred.url ?? ''} onChange={e => onUpdate({ url: e.target.value })}
            placeholder={preset.urlHint ?? 'https://...'} className="h-8 text-xs font-mono" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Utilisateur</label>
          <Input value={cred.username ?? ''} onChange={e => onUpdate({ username: e.target.value })}
            placeholder="admin" className="h-8 text-xs font-mono" autoComplete="off" />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Mot de passe</label>
          <PasswordField value={cred.password ?? ''} onChange={v => onUpdate({ password: v })} />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Notes</label>
          <AutocorrectInput value={cred.notes ?? ''} onChange={e => onUpdate({ notes: e.target.value })}
            placeholder="Procédure de reset, secret 2FA, etc." className="h-8 text-xs" />
        </div>
      </div>
    </div>
  )
}
