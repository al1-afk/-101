import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Contact, Phone, RefreshCw, Loader2, CheckCircle2, AlertTriangle,
  Link2, Link2Off, Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { googleContactsApi } from '@/lib/googleContactsApi'
import { useAuth } from '@/hooks/useAuth'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'

const CAN_USE = new Set(['admin', 'manager', 'commercial'])

/** Petit interrupteur (pas de composant Switch dans le design system). */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function GoogleContactsCard() {
  const auth = useAuth()
  const qc = useQueryClient()
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const pollRef = useRef<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['gcontacts-status'],
    queryFn: googleContactsApi.status,
    staleTime: 30_000,
  })

  const refetch = useCallback(() => qc.invalidateQueries({ queryKey: ['gcontacts-status'] }), [qc])

  // Écoute le message de la popup OAuth puis rafraîchit le statut.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e?.data?.source !== 'gcontacts-oauth') return
      setConnecting(false)
      if (e.data.ok) {
        toast.success('Compte Google connecté. Synchronisation en cours…')
        // Le 1er sync tourne en arrière-plan côté serveur : on rafraîchit
        // quelques fois pour voir le compteur se remplir.
        let n = 0
        pollRef.current = window.setInterval(() => {
          refetch(); if (++n >= 4 && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }, 2500)
      } else {
        toast.error('La connexion Google a échoué.')
      }
    }
    window.addEventListener('message', handler)
    return () => {
      window.removeEventListener('message', handler)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [refetch])

  if (!CAN_USE.has(auth.role ?? '')) return null

  const status = data
  const link = status?.link
  const connected = !!link?.connected

  const connect = async () => {
    try {
      setConnecting(true)
      const { url } = await googleContactsApi.oauthUrl()
      const w = 520, h = 640
      const y = window.top!.outerHeight / 2 + window.top!.screenY - h / 2
      const x = window.top!.outerWidth / 2 + window.top!.screenX - w / 2
      const popup = window.open(url, 'gcontacts_oauth', `width=${w},height=${h},top=${y},left=${x}`)
      if (!popup) { setConnecting(false); toast.error('Popup bloquée. Autorisez les popups pour ce site.') }
    } catch (e: unknown) {
      setConnecting(false)
      toast.error(e instanceof Error ? e.message : 'Impossible de démarrer la connexion Google')
    }
  }

  const syncNow = async () => {
    try {
      setSyncing(true)
      const r = await googleContactsApi.sync()
      const c = r.counts
      toast.success(c
        ? `Synchronisé : ${c.created} ajout(s), ${c.updated} maj, ${c.deleted} suppr. (${r.contactsCount ?? 0} contacts)`
        : 'Synchronisation terminée')
      refetch()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      toast.error(/reconnexion/i.test(msg) ? 'Reconnexion Google requise' : (msg || 'Échec de la synchronisation'))
      refetch()
    } finally { setSyncing(false) }
  }

  const setAutoSync = async (v: boolean) => {
    try { await googleContactsApi.settings({ autoSync: v }); refetch() }
    catch { toast.error('Impossible de modifier le réglage') }
  }
  const setIncludeCompany = async (v: boolean) => {
    try { await googleContactsApi.settings({ includeCompany: v }); refetch() }
    catch { toast.error('Impossible de modifier le réglage') }
  }

  const disconnect = async () => {
    if (!confirm('Déconnecter Google Contacts ? Les contacts déjà créés resteront dans votre compte Google.')) return
    try { await googleContactsApi.disconnect(); toast.success('Google Contacts déconnecté'); refetch() }
    catch { toast.error('Échec de la déconnexion') }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/15 to-emerald-500/15 flex items-center justify-center shrink-0">
          <Contact className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">Google Contacts — Caller ID</h3>
            {connected && link?.status === 'active' && (
              <Badge variant="outline" className="text-emerald-600 border-emerald-400/50 bg-emerald-50 dark:bg-emerald-950/30 text-[11px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Connecté
              </Badge>
            )}
            {connected && link?.status === 'needs_reauth' && (
              <Badge variant="outline" className="text-amber-600 border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 text-[11px]">
                <AlertTriangle className="w-3 h-3 mr-1" /> Reconnexion requise
              </Badge>
            )}
            {connected && link?.status === 'error' && (
              <Badge variant="outline" className="text-red-600 border-red-400/50 bg-red-50 dark:bg-red-950/30 text-[11px]">
                <AlertTriangle className="w-3 h-3 mr-1" /> Erreur
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Quand un prospect appelle, son <span className="font-medium text-foreground">nom s'affiche sur votre téléphone</span>.
            Les prospects (nom + numéro) sont synchronisés vers vos Google Contacts.
          </p>

          {/* Serveur non configuré */}
          {status && !status.configured && (
            <div className="mt-3 text-xs rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 px-3 py-2">
              Google OAuth n'est pas encore configuré côté serveur (variables <code>GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI</code>).
            </div>
          )}

          {/* Non connecté */}
          {status?.configured && !connected && (
            <div className="mt-4">
              <Button onClick={connect} disabled={connecting} className="gap-2">
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Connecter Google Contacts
              </Button>
            </div>
          )}

          {/* Connecté */}
          {connected && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Compte&nbsp;:</span>
                <span className="font-medium text-foreground truncate">{link?.googleEmail ?? '—'}</span>
              </div>

              {link?.status === 'needs_reauth' && (
                <div className="text-xs rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 px-3 py-2">
                  L'accès Google a expiré. Cliquez sur « Reconnecter » pour rétablir la synchronisation.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat icon={Contact} label="Contacts synchro." value={String(link?.contactsCount ?? 0)} />
                <Stat icon={RefreshCw} label="Dernier sync" value={link?.lastSyncedAt ? formatDate(link.lastSyncedAt) : 'Jamais'} />
                <Stat icon={Phone} label="Auto-sync" value={link?.autoSync ? 'Activé' : 'Désactivé'} />
              </div>

              {/* Réglages */}
              <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-3">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /> Synchronisation automatique (toutes les 10 min)</span>
                  <Toggle checked={!!link?.autoSync} onChange={setAutoSync} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-muted-foreground" /> Inclure le nom de l'entreprise</span>
                  <Toggle checked={link?.includeCompany !== false} onChange={setIncludeCompany} />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={syncNow} disabled={syncing} variant="outline" className="gap-2">
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Synchroniser maintenant
                </Button>
                {link?.status === 'needs_reauth' && (
                  <Button onClick={connect} disabled={connecting} className="gap-2">
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Reconnecter
                  </Button>
                )}
                <Button onClick={disconnect} variant="ghost" className="gap-2 text-muted-foreground hover:text-red-600">
                  <Link2Off className="w-4 h-4" /> Déconnecter
                </Button>
              </div>
            </div>
          )}

          {isLoading && !status && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="w-3 h-3" /> {label}</div>
      <div className="text-sm font-semibold text-foreground mt-0.5 truncate">{value}</div>
    </div>
  )
}
