/**
 * DROITS CRM TRANSVERSES — les cases « voit tout » du cahier des charges.
 *
 * Par défaut, un commercial ne voit que ce qu'il a créé, ce qu'on lui a
 * assigné et ce qu'on lui a explicitement partagé (server/lib/crmScope.ts).
 * Cette carte permet à un administrateur d'ouvrir la vue COMPLÈTE d'un
 * module à quelqu'un — le commercial senior qui suit tout le portefeuille —
 * SANS le promouvoir manager, ce qui lui donnerait au passage la paie, les
 * paramètres de l'espace et la gestion des membres.
 *
 * ── Cet écran ne protège rien ───────────────────────────────────────
 * Il ÉCRIT des données (crm_user_capabilities) que le serveur relit à chaque
 * requête. Le refus, lui, est prononcé par requireRole('admin') dans
 * server/routes/crmAccess.ts : masquer la carte à un non-administrateur est
 * un confort d'affichage, pas une fermeture. C'est aussi pourquoi les
 * libellés viennent de CRM_CAPABILITY_LABELS (src/lib/api.ts), partagés avec
 * la fiche prospect : deux écrans qui nommeraient différemment le même droit
 * finiraient par en promettre un qui n'existe pas.
 */
import { useState, useMemo } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Lock, Loader2, Save, ShieldCheck, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  crmAccessApi, CRM_CAPABILITIES, CRM_CAPABILITY_LABELS,
  type CrmAssignable, type CrmCapability,
} from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import { ROLE_LABELS, ROLE_COLORS, type Role } from '@/lib/permissions'

/* Les rôles qui voient déjà tout l'espace par nature. Même liste que
   `estGestionnaire` côté serveur : leur cocher des capacités n'ajouterait
   rien, d'où la ligne désactivée plutôt qu'un réglage sans effet. */
const ROLES_GESTIONNAIRES = new Set(['admin', 'super_admin', 'manager'])
const estGestionnaire = (role: string) =>
  ROLES_GESTIONNAIRES.has((role ?? '').toLowerCase().trim())

/* Regroupement d'affichage. Le vocabulaire, lui, reste celui de
   CRM_CAPABILITIES : ces groupes ne servent qu'à ranger les huit cases, ils
   n'inventent aucun droit. */
const GROUPES: { titre: string; caps: CrmCapability[] }[] = [
  { titre: 'Prospects', caps: ['prospects.view_all', 'prospects.edit_all'] },
  { titre: 'Clients',   caps: ['clients.view_all',   'clients.edit_all']   },
  { titre: 'Devis',     caps: ['devis.view_all',     'devis.edit_all']     },
  { titre: 'Transverse', caps: ['activities.view_all', 'convert.all']      },
]

/* Les erreurs remontées par `request` (src/lib/api.ts) portent déjà le
   message du serveur — « migration 102 à appliquer », « Permissions
   insuffisantes ». On l'affiche tel quel plutôt qu'un « Erreur » générique
   qui obligerait à ouvrir la console pour savoir quoi faire. */
function messageErreur(e: unknown, defaut: string): string {
  return e instanceof Error && e.message ? e.message : defaut
}

/* Une phrase par case : le libellé dit QUOI, ceci dit jusqu'où ça va.
   Les trois « Modifier tous… » emportent aussi la saisie d'activité, le
   devis et la conversion sur ces fiches (crmScope, CAPACITES_SUFFISANTES) —
   le taire ferait accorder plus que ce que l'administrateur croit cocher. */
const AIDE: Record<CrmCapability, string> = {
  'prospects.view_all':  'Consulter les prospects des autres commerciaux, sans pouvoir les modifier.',
  'prospects.edit_all':  'Modifier les prospects des autres — y compris saisir une activité, devis et conversion.',
  'clients.view_all':    'Consulter les clients des autres commerciaux, sans pouvoir les modifier.',
  'clients.edit_all':    'Modifier les clients des autres — y compris saisir une activité et devis.',
  'devis.view_all':      'Consulter tous les devis de l’espace, montants compris.',
  'devis.edit_all':      'Modifier les devis des autres commerciaux.',
  'activities.view_all': 'Voir le journal d’activité de toutes les fiches, pas seulement des siennes.',
  'convert.all':         'Convertir en client n’importe quel prospect de l’espace.',
}

/* ═══════════════════════════════════════════════════════════════════
   CARTE — la liste du personnel
═══════════════════════════════════════════════════════════════════ */
export default function CrmCapabilitiesCard() {
  const { isAdmin } = usePermissions()

  /* `enabled: isAdmin` : sans cela, un comptable ouvrant l'onglet
     Permissions déclencherait une rafale d'appels que le serveur refuse en
     403 — du bruit dans les journaux pour un écran qu'on n'affiche pas. */
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['crm-assignables'],
    queryFn:  () => crmAccessApi.assignables(),
    enabled:  isAdmin,
    staleTime: 1000 * 60,
  })

  /* Mémoïsé : `data?.users ?? []` crée un tableau neuf à chaque rendu, ce qui
     relancerait sans fin les dépendances qui s'appuient dessus. */
  const users: CrmAssignable[] = useMemo(() => data?.users ?? [], [data])

  /* Les capacités de chacun, pour que l'administrateur voie D'UN COUP D'ŒIL
     qui regarde tout — c'est la question qu'il se pose en ouvrant l'écran.
     Une requête par personne : l'espace compte quelques dizaines de comptes,
     pas un annuaire, et les gestionnaires sont exclus (ils voient déjà tout,
     leur ligne est inerte). `retry: false` évite de multiplier les appels
     quand la migration 102 n'est pas encore passée — le serveur répond
     alors 503, une fois par personne, et cela suffit à le signaler. */
  const capsResults = useQueries({
    queries: users.map(u => ({
      queryKey: ['crm-capabilities', u.user_id],
      queryFn:  () => crmAccessApi.capabilities(u.user_id),
      enabled:  isAdmin && !estGestionnaire(u.role),
      staleTime: 1000 * 60,
      retry:    false,
    })),
  })

  const capsParUser = useMemo(() => {
    const m = new Map<string, CrmCapability[]>()
    users.forEach((u, i) => {
      const r = capsResults[i]
      if (r?.data) m.set(u.user_id, r.data.capabilities)
    })
    return m
  }, [users, capsResults])

  const [editing, setEditing] = useState<CrmAssignable | null>(null)

  if (!isAdmin) {
    return (
      <div className="card-premium p-4 flex items-center gap-3 text-sm text-muted-foreground">
        <Lock className="w-4 h-4" />
        Seul un administrateur peut accorder les droits CRM transverses.
      </div>
    )
  }

  return (
    <>
      <div className="card-premium p-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold text-sm">Droits CRM par personne</h3>
            <Badge variant="outline" className="text-[10px]">{users.length}</Badge>
          </div>
          <span className="text-[11px] text-muted-foreground italic">
            Par défaut, chacun ne voit que ses fiches : créées, assignées ou partagées
          </span>
        </div>

        {isError ? (
          <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {messageErreur(error, 'Droits CRM indisponibles')}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-xs text-muted-foreground italic text-center py-4">
            Aucun compte actif dans cet espace.
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Personne</th>
                  <th className="text-left px-3 py-2">Rôle</th>
                  <th className="text-left px-3 py-2">Périmètre CRM</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map(u => {
                  const gestionnaire = estGestionnaire(u.role)
                  const caps = capsParUser.get(u.user_id) ?? []
                  return (
                    <tr key={u.user_id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium text-sm">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold',
                          ROLE_COLORS[u.role as Role])}>
                          {ROLE_LABELS[u.role as Role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {gestionnaire ? (
                          <span className="text-xs text-muted-foreground">
                            Voit et modifie tout — par son rôle
                          </span>
                        ) : caps.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">
                            Ses fiches uniquement
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {caps.map(c => (
                              <span key={c}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                {CRM_CAPABILITY_LABELS[c]}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={gestionnaire}
                          onClick={() => setEditing(u)}
                          title={gestionnaire
                            ? 'Les gestionnaires voient déjà tout le CRM'
                            : 'Accorder ou retirer des droits CRM'}
                        >
                          <KeyRound className="w-3.5 h-3.5" /> Droits CRM
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CrmCapabilitiesDialog user={editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   DIALOGUE — les huit cases d'une personne
═══════════════════════════════════════════════════════════════════ */
function CrmCapabilitiesDialog({ user, onClose }: { user: CrmAssignable; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['crm-capabilities', user.user_id],
    queryFn:  () => crmAccessApi.capabilities(user.user_id),
    retry:    false,
  })

  /* État DÉRIVÉ tant que rien n'est touché : `brouillon` reste nul, et les
     cases reflètent ce que le serveur a renvoyé. C'est important parce que
     l'écriture remplace la liste ENTIÈRE (PUT) — partir d'un état deviné
     retirerait en silence un droit accordé entre-temps depuis un autre poste.
     Dès la première case cochée, le brouillon prend la main et un refetch en
     arrière-plan n'efface plus la saisie en cours. */
  const [brouillon, setBrouillon] = useState<Set<CrmCapability> | null>(null)
  const serveur = useMemo(
    () => new Set<CrmCapability>(data?.capabilities ?? []),
    [data],
  )
  const selected = brouillon ?? serveur

  const save = useMutation({
    mutationFn: () => crmAccessApi.saveCapabilities(user.user_id, [...selected]),
    onSuccess: (res) => {
      /* On réécrit le cache avec la liste RENVOYÉE par le serveur, pas avec
         celle qu'on a envoyée : lui seul décide de l'ordre canonique et du
         dédoublonnage, et la carte doit afficher ce qui est réellement
         enregistré. */
      qc.setQueryData(['crm-capabilities', user.user_id], { capabilities: res.capabilities })
      qc.invalidateQueries({ queryKey: ['crm-capabilities', user.user_id] })
      toast.success(res.capabilities.length
        ? `Droits CRM mis à jour pour ${user.name}`
        : `Droits CRM retirés à ${user.name}`)
      onClose()
    },
    onError: (e: unknown) => toast.error(messageErreur(e, 'Enregistrement impossible')),
  })

  const toggle = (cap: CrmCapability) => {
    setBrouillon(prev => {
      const next = new Set(prev ?? serveur)
      if (next.has(cap)) next.delete(cap)
      else next.add(cap)
      return next
    })
  }

  const allOn  = () => setBrouillon(new Set(CRM_CAPABILITIES))
  const allOff = () => setBrouillon(new Set())

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
            Droits CRM — {user.name}
          </DialogTitle>
        </DialogHeader>

        {isError ? (
          <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {messageErreur(error, 'Droits CRM indisponibles')}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-border p-3 bg-muted/30 text-xs text-muted-foreground">
              Sans aucune case cochée, <strong className="text-foreground">{user.name}</strong> ne
              voit que les fiches qu’elle ou il a créées, celles qui lui sont assignées et
              celles qu’on lui a explicitement partagées. Chaque case ci-dessous ouvre en plus
              la vue complète d’un module — sans changer son rôle
              ({ROLE_LABELS[user.role as Role] ?? user.role}), donc sans lui donner la paie
              ni les paramètres de l’espace.
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selected.size} / {CRM_CAPABILITIES.length} droit(s) accordé(s)
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={allOn}>Tout cocher</Button>
                <Button size="sm" variant="ghost" onClick={allOff}>Tout décocher</Button>
              </div>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto rounded-md border border-border p-3">
              {GROUPES.map(g => (
                <div key={g.titre}>
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">
                    {g.titre}
                  </p>
                  <div className="space-y-1">
                    {g.caps.map(cap => {
                      const checked = selected.has(cap)
                      return (
                        <label
                          key={cap}
                          className={cn(
                            'flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-sm',
                            checked ? 'bg-blue-50 dark:bg-blue-950/30 text-foreground' : 'hover:bg-muted/40',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(cap)}
                            className="w-4 h-4 rounded border-border mt-0.5 flex-shrink-0"
                          />
                          <span className="flex-1">
                            <span className="block">{CRM_CAPABILITY_LABELS[cap]}</span>
                            <span className="block text-[11px] text-muted-foreground">{AIDE[cap]}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Avertissement à l'écran plutôt qu'en commentaire : « voir tous
                les devis » expose les montants et les marges de toute
                l'équipe, et cela ne se devine pas d'un intitulé. */}
            {(selected.has('devis.view_all') || selected.has('devis.edit_all')) && (
              <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Les droits sur les devis exposent les montants de tout l’espace.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={onClose}>Annuler</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Save className="w-4 h-4" /> Enregistrer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
