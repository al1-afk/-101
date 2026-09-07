/**
 * « Ajouter un commercial » — un RATTACHEMENT, jamais une création.
 *
 * ── Pourquoi ce dialogue ne ressemble pas à un formulaire
 * Le réflexe, devant un bouton « + Ajouter », est de saisir un nom et un
 * e-mail. Ici ce serait une faute : la personne existe déjà, dans
 * « Équipe » ou parmi les comptes de l'espace, et lui refaire une fiche
 * créerait un second compte, un second historique et deux versions du
 * même commercial. On ne propose donc aucun champ de saisie — seulement
 * une liste de personnes existantes et un bouton « Rattacher ».
 *
 * ── Pourquoi les personnes déjà rattachées restent affichées
 * Les faire disparaître laisserait chercher quelqu'un qu'on vient
 * d'ajouter, en doutant d'avoir cliqué. Elles restent, grisées, avec la
 * mention « déjà commercial » : c'est la réponse à la question qu'on se
 * pose en les cherchant.
 *
 * ── Pourquoi le dialogue ne se ferme pas au premier ajout
 * On ouvre rarement le CRM à une seule personne. La ligne bascule sur
 * place en « déjà commercial » et la liste reste ouverte pour la
 * suivante ; c'est « Terminer » qui referme.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, UserPlus, Loader2, Info, ShieldCheck, Users2, RefreshCw,
  AlertTriangle, Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { commercialsApi, type CommercialCandidate } from '@/lib/api'
import { getInitials, cn } from '@/lib/utils'

interface Props {
  open:         boolean
  onOpenChange: (o: boolean) => void
}

export default function AddCommercialDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient()
  const [recherche, setRecherche] = useState('')

  /* Sous-clé de ['commercials'] : rattacher quelqu'un invalide la racine
     et rafraîchit d'un coup la liste de la page ET cette liste-ci, sans
     que le dialogue ait à connaître l'écran qui l'a ouvert.
     `enabled` sur `open` : la liste des candidats n'a aucune raison
     d'être chargée tant que personne n'a ouvert le dialogue. */
  const q = useQuery({
    queryKey: ['commercials', 'candidates'],
    queryFn:  () => commercialsApi.candidates(),
    enabled:  open,
    staleTime: 30_000,
  })

  const personnes = useMemo<CommercialCandidate[]>(() => {
    const liste = q.data?.people ?? []
    /* Les rattachables d'abord, puis les employés avant les comptes
       d'administration : on cherche presque toujours un salarié, et les
       lignes grisées en tête donneraient l'impression d'une liste déjà
       épuisée. */
    return [...liste].sort((a, b) =>
      Number(a.already) - Number(b.already) ||
      a.kind.localeCompare(b.kind) ||
      a.name.localeCompare(b.name, 'fr'),
    )
  }, [q.data])

  const filtrees = useMemo(() => {
    const t = recherche.trim().toLowerCase()
    if (!t) return personnes
    return personnes.filter(p =>
      [p.name, p.email].some(v => (v ?? '').toLowerCase().includes(t)),
    )
  }, [personnes, recherche])

  const rattachables = personnes.filter(p => !p.already).length

  const ajout = useMutation({
    mutationFn: (p: CommercialCandidate) => commercialsApi.add(p.user_id),
    onSuccess: (_res, p) => {
      /* La racine couvre la liste de la page, la fiche de la personne et
         cette liste de candidats — trois écrans qui mentiraient ensemble
         si l'un d'eux gardait son cache. */
      qc.invalidateQueries({ queryKey: ['commercials'] })
      toast.success(`${p.name} est maintenant commercial`, {
        description: 'Accès CRM ouvert avec un jeu de droits de départ. Ajuste-les depuis sa fiche.',
      })
    },
    onError: (e: unknown, p) => {
      toast.error(
        e instanceof Error ? e.message : `Impossible de rattacher ${p.name}`,
      )
    },
  })

  const fermer = (o: boolean) => {
    onOpenChange(o)
    if (!o) setRecherche('')
  }

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-500" /> Ajouter un commercial
          </DialogTitle>
          <DialogDescription>
            Un commercial est une personne déjà présente dans votre espace à qui
            vous ouvrez le CRM. Aucun second compte n'est créé.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 p-2.5">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">
              Rattacher accorde l'accès au module et un jeu de droits de départ
              (voir et créer ses prospects, journaliser note, appel et relance).
              Tout se règle ensuite finement depuis la fiche.
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher une personne…"
              className="pl-9 h-9"
              aria-label="Rechercher une personne à rattacher"
              autoFocus
            />
          </div>

          {/* ── Chargement ─────────────────────────────────────────── */}
          {q.isLoading && (
            <div className="space-y-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
              ))}
            </div>
          )}

          {/* ── Erreur ─────────────────────────────────────────────── */}
          {q.isError && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20 p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">
                Impossible de charger les personnes de votre espace
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {q.error instanceof Error ? q.error.message : 'La requête a échoué.'}
              </p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => q.refetch()}>
                <RefreshCw className="w-3.5 h-3.5" /> Réessayer
              </Button>
            </div>
          )}

          {/* ── Liste ──────────────────────────────────────────────── */}
          {q.isSuccess && (
            filtrees.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
                <Users2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                {personnes.length === 0 ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">
                      Aucune personne rattachable
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ajoutez d'abord un salarié depuis <strong>Équipe</strong>, ou
                      invitez un collaborateur dans votre espace.
                    </p>
                  </>
                ) : rattachables === 0 ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">
                      Tout le monde est déjà commercial
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Les {personnes.length} personnes de votre espace ont déjà accès au CRM.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-foreground">Aucun résultat</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Aucune personne ne correspond à « {recherche.trim()} ».
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="max-h-[46vh] overflow-y-auto space-y-1.5 pr-0.5">
                {filtrees.map(p => {
                  const enCours = ajout.isPending && ajout.variables?.user_id === p.user_id
                  return (
                    <div
                      key={p.user_id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
                        p.already
                          ? 'border-border bg-muted/40 opacity-60'
                          : 'border-border hover:border-blue-400/50 hover:bg-blue-50/40 dark:hover:bg-blue-950/20',
                      )}
                    >
                      <span className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
                        p.kind === 'admin'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
                      )}>
                        {getInitials(p.name) || '?'}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {p.email}
                          {' · '}
                          {p.kind === 'admin' ? "Compte d'administration" : 'Employé'}
                        </p>
                      </div>

                      {p.already ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                          <ShieldCheck className="w-3.5 h-3.5" /> déjà commercial
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          disabled={ajout.isPending}
                          onClick={() => ajout.mutate(p)}
                        >
                          {enCours
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Check className="w-3.5 h-3.5" />}
                          Rattacher
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
          <span className="text-[11px] text-muted-foreground">
            {q.isSuccess && `${rattachables} personne${rattachables > 1 ? 's' : ''} rattachable${rattachables > 1 ? 's' : ''}`}
          </span>
          <Button variant="secondary" onClick={() => fermer(false)}>Terminer</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
