/**
 * Onglet « Sessions & appareils ».
 *
 * Deux listes distinctes, et c'est délibéré : une SESSION est une
 * connexion vivante (une ligne de refresh_tokens, avec son IP et son
 * navigateur) ; un APPAREIL DE CONFIANCE est une dispense de 2FA
 * accordée à une machine. Rien en base ne relie l'un à l'autre — pas de
 * colonne commune — et fabriquer ce lien par ressemblance d'user-agent
 * aurait produit un tableau qui a l'air sûr et se trompe. On affiche
 * donc ce que les données disent réellement, et rien de plus.
 *
 * Révoquer coupe VRAIMENT : le jeton d'accès porte l'identifiant de sa
 * session et chaque requête le vérifie (server/lib/sessionRevocation).
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Loader2, Monitor, LogOut, ShieldOff, MapPin, Clock, Inbox, AlertTriangle,
} from 'lucide-react'
import { securityApi, type SessionRow, type DeviceRow } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const fmt = (s: string | null) => {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return s }
}

/** « Chrome · macOS » — jamais l'user-agent brut, illisible et bruyant. */
const shortUA = (ua: string | null): string => {
  if (!ua) return '—'
  let b = 'Navigateur', o = 'OS'
  if (/Edg\//.test(ua)) b = 'Edge'
  else if (/Chrome/.test(ua)) b = 'Chrome'
  else if (/Safari/.test(ua)) b = 'Safari'
  else if (/Firefox/.test(ua)) b = 'Firefox'
  if (/iPhone|iPad|iOS/.test(ua)) o = 'iOS'
  else if (/Android/.test(ua))   o = 'Android'
  else if (/Windows/.test(ua))   o = 'Windows'
  else if (/Mac OS X|Macintosh/.test(ua)) o = 'macOS'
  else if (/Linux/.test(ua))     o = 'Linux'
  return `${b} · ${o}`
}

const BADGE: Record<string, string> = {
  active:   'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  actif:    'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  expiree:  'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  expire:   'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  revoquee: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400',
  revoque:  'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400',
}
const LIBELLE: Record<string, string> = {
  active: 'Active', actif: 'Actif',
  expiree: 'Expirée', expire: 'Expiré',
  revoquee: 'Révoquée', revoque: 'Révoqué',
}

/** Confirmation avant toute coupure : déconnecter quelqu'un n'est pas
 *  un geste qu'on rattrape. */
function Confirmation({ ouvert, titre, texte, onAnnuler, onConfirmer, enCours }: {
  ouvert: boolean; titre: string; texte: string
  onAnnuler: () => void; onConfirmer: () => void; enCours: boolean
}) {
  return (
    <Dialog open={ouvert} onOpenChange={(o: boolean) => { if (!o && !enCours) onAnnuler() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" /> {titre}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{texte}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onAnnuler} disabled={enCours}>Annuler</Button>
          {/* Action destructive : couleur distincte du reste de l'écran. */}
          <Button
            onClick={onConfirmer}
            disabled={enCours}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Squelette({ lignes = 4 }: { lignes?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: lignes }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
      ))}
    </div>
  )
}

function Vide({ texte }: { texte: string }) {
  return (
    <div className="py-10 text-center">
      <Inbox className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">{texte}</p>
    </div>
  )
}

export default function SessionsTab() {
  const qc = useQueryClient()
  const [toutMontrer, setToutMontrer] = useState(false)
  const [aCouper, setACouper] = useState<SessionRow | null>(null)
  const [aRevoquer, setARevoquer] = useState<DeviceRow | null>(null)
  const [toutCouper, setToutCouper] = useState<SessionRow | null>(null)

  /* Clé préfixée « security » : c'est ce qui la fait rafraîchir par le
     bouton « Actualiser » global de la page. `retry: false` : un 403
     réessayé journalise plusieurs refus d'accès pour rien. */
  const sessions = useQuery({
    queryKey: ['security', 'sessions', toutMontrer],
    queryFn:  () => securityApi.sessions(toutMontrer ? { all: '1', limit: 100 } : { limit: 100 }),
    retry: false,
  })
  const appareils = useQuery({
    queryKey: ['security', 'devices'],
    queryFn:  () => securityApi.devices({ limit: 100 }),
    retry: false,
  })

  const apres = (message: string) => {
    qc.invalidateQueries({ queryKey: ['security'] })
    toast.success(message)
  }

  const couper = useMutation({
    mutationFn: (id: string) => securityApi.revokeSession(id),
    onSuccess: () => { setACouper(null); apres('Session déconnectée') },
    onError: (e: Error) => toast.error(e.message || 'Impossible de couper cette session'),
  })
  const couperTout = useMutation({
    mutationFn: (userId: string) => securityApi.revokeAllSessions(userId),
    onSuccess: (r) => { setToutCouper(null); apres(`${r.revoked} session(s) déconnectée(s)`) },
    onError: (e: Error) => toast.error(e.message || 'Impossible de couper ces sessions'),
  })
  const revoquer = useMutation({
    mutationFn: (id: string) => securityApi.revokeDevice(id),
    onSuccess: () => { setARevoquer(null); apres('Appareil révoqué — la 2FA sera redemandée') },
    onError: (e: Error) => toast.error(e.message || 'Impossible de révoquer cet appareil'),
  })

  const erreur = sessions.error || appareils.error

  return (
    <div className="space-y-6">
      {erreur && (
        <div className="card-premium p-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {String((erreur as Error).message)}
        </div>
      )}

      {/* ══ Sessions ══════════════════════════════════════════════ */}
      <div className="card-premium overflow-hidden">
        <div className="p-4 flex items-center justify-between gap-3 flex-wrap border-b border-border">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Monitor className="w-4 h-4 text-blue-600" />
              Sessions {sessions.data && `(${sessions.data.rows.length})`}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Une ligne par connexion. Déconnecter coupe l'accès immédiatement, pas à l'expiration.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setToutMontrer(v => !v)}>
            {toutMontrer ? 'Sessions actives seulement' : 'Inclure expirées et révoquées'}
          </Button>
        </div>

        {sessions.isLoading ? <Squelette /> : !sessions.data?.rows.length ? (
          <Vide texte="Aucune session à afficher." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Utilisateur</th>
                  <th className="px-4 py-2.5 text-left font-medium">Appareil</th>
                  <th className="px-4 py-2.5 text-left font-medium">IP</th>
                  <th className="px-4 py-2.5 text-left font-medium">Connexion</th>
                  <th className="px-4 py-2.5 text-left font-medium">Statut</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.data.rows.map(s => (
                  <tr key={s.id} className="table-row border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{s.user_name}</p>
                      <p className="text-xs text-muted-foreground">{s.user_email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{shortUA(s.user_agent)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{s.ip_address ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(s.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${BADGE[s.statut]}`}>
                        {LIBELLE[s.statut]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {s.statut === 'active' && (
                          <>
                            <Button
                              size="sm" variant="outline"
                              className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
                              onClick={() => setACouper(s)}
                            >
                              <LogOut className="w-3 h-3" /> Déconnecter
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="h-7 text-[11px]"
                              onClick={() => setToutCouper(s)}
                              title="Déconnecter toutes les sessions de cette personne"
                            >
                              Toutes
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ Appareils de confiance ════════════════════════════════ */}
      <div className="card-premium overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <ShieldOff className="w-4 h-4 text-violet-600" />
            Appareils de confiance {appareils.data && `(${appareils.data.rows.length})`}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Machines dispensées de 2FA. Révoquer force une nouvelle vérification à la prochaine connexion.
          </p>
        </div>

        {appareils.isLoading ? <Squelette lignes={3} /> : !appareils.data?.rows.length ? (
          <Vide texte="Aucun appareil de confiance enregistré." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Utilisateur</th>
                  <th className="px-4 py-2.5 text-left font-medium">Appareil</th>
                  <th className="px-4 py-2.5 text-left font-medium">IP</th>
                  <th className="px-4 py-2.5 text-left font-medium">Dernier usage</th>
                  <th className="px-4 py-2.5 text-left font-medium">Statut</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {appareils.data.rows.map(d => (
                  <tr key={d.id} className="table-row border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{d.user_name}</p>
                      <p className="text-xs text-muted-foreground">{d.user_email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.label || shortUA(d.user_agent)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {d.ip_address ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{fmt(d.last_used_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${BADGE[d.statut]}`}>
                        {LIBELLE[d.statut]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {d.statut === 'actif' && (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
                          onClick={() => setARevoquer(d)}
                        >
                          <ShieldOff className="w-3 h-3" /> Révoquer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Confirmation
        ouvert={!!aCouper}
        titre="Déconnecter cette session ?"
        texte={aCouper
          ? `${aCouper.user_name} sera déconnecté sur ${shortUA(aCouper.user_agent)} immédiatement. Ses autres sessions restent ouvertes.`
          : ''}
        enCours={couper.isPending}
        onAnnuler={() => setACouper(null)}
        onConfirmer={() => aCouper && couper.mutate(aCouper.id)}
      />
      <Confirmation
        ouvert={!!toutCouper}
        titre="Déconnecter toutes ses sessions ?"
        texte={toutCouper
          ? `Toutes les connexions de ${toutCouper.user_name} seront coupées, sur tous ses appareils. Il devra se reconnecter.`
          : ''}
        enCours={couperTout.isPending}
        onAnnuler={() => setToutCouper(null)}
        onConfirmer={() => toutCouper && couperTout.mutate(toutCouper.user_id)}
      />
      <Confirmation
        ouvert={!!aRevoquer}
        titre="Révoquer cet appareil de confiance ?"
        texte={aRevoquer
          ? `${aRevoquer.user_name} devra repasser la vérification 2FA lors de sa prochaine connexion depuis ${aRevoquer.label || shortUA(aRevoquer.user_agent)}.`
          : ''}
        enCours={revoquer.isPending}
        onAnnuler={() => setARevoquer(null)}
        onConfirmer={() => aRevoquer && revoquer.mutate(aRevoquer.id)}
      />
    </div>
  )
}
