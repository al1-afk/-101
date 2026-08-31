/**
 * Onglet « Journal d'audit ».
 *
 * Lit `audit_logs` : qui a créé, modifié ou supprimé quoi, avec la valeur
 * d'avant et celle d'après. La table portait 403 lignes en production et
 * aucune route ne la lisait — l'historique existait sans être consultable.
 *
 * Pagination et filtres sont faits CÔTÉ SERVEUR. La table ne cesse de
 * grossir : la charger entière serait intenable, et exposerait d'un seul
 * coup tout l'historique de l'espace au navigateur.
 *
 * Les valeurs avant/après ne sont dépliées qu'à la demande, ligne par
 * ligne : elles peuvent contenir des données confidentielles, elles n'ont
 * pas à s'étaler dans un tableau que l'on parcourt.
 */
import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  Search, ChevronLeft, ChevronRight, Inbox, AlertTriangle,
  FileText, ChevronDown, ChevronUp, MapPin,
} from 'lucide-react'
import { securityApi, type AuditRow, type SecurityPeriod } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const PAR_PAGE = 25
const TOUT = '__tout__'

const fmt = (s: string) => {
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return s }
}

const ACTION_STYLE: Record<string, string> = {
  INSERT: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  UPDATE: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  DELETE: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
}
const ACTION_LABEL: Record<string, string> = {
  INSERT: 'Création', UPDATE: 'Modification', DELETE: 'Suppression',
}

/* Un journal ne doit jamais recracher un secret. Même si ces colonnes
   n'ont rien à faire dans les tables auditées, on masque par principe :
   le jour où l'une y arrive, elle sera déjà couverte. */
const CHAMPS_SENSIBLES = /pass|secret|token|api[_-]?key|hash|salt|otp|code|credential/i
const masquer = (v: unknown): string => {
  if (v === null || v === undefined) return '—'
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return t.length > 120 ? `${t.slice(0, 120)}…` : t
}

/** Ce qui a réellement changé entre l'avant et l'après — plutôt que deux
 *  gros blocs JSON que personne ne compare à l'œil. */
function Differences({ ligne }: { ligne: AuditRow }) {
  const avant = ligne.old_data ?? {}
  const apres = ligne.new_data ?? {}
  const cles = [...new Set([...Object.keys(avant), ...Object.keys(apres)])]
    .filter(k => JSON.stringify(avant[k]) !== JSON.stringify(apres[k]))
    .sort()

  if (cles.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Aucune différence enregistrée.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-medium py-1 pr-4">Champ</th>
            <th className="text-left font-medium py-1 pr-4">Avant</th>
            <th className="text-left font-medium py-1">Après</th>
          </tr>
        </thead>
        <tbody>
          {cles.map(k => {
            const sensible = CHAMPS_SENSIBLES.test(k)
            return (
              <tr key={k} className="border-t border-border/60">
                <td className="py-1 pr-4 font-mono text-foreground">{k}</td>
                <td className="py-1 pr-4 text-muted-foreground break-all">
                  {sensible ? '••••••••' : masquer(avant[k])}
                </td>
                <td className="py-1 text-foreground break-all">
                  {sensible ? '••••••••' : masquer(apres[k])}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function AuditTab() {
  const [q, setQ]             = useState('')
  const [recherche, setRech]  = useState('')
  const [utilisateur, setUti] = useState(TOUT)
  const [table, setTable]     = useState(TOUT)
  const [action, setAction]   = useState(TOUT)
  const [periode, setPeriode] = useState<SecurityPeriod>('30d')
  const [page, setPage]       = useState(0)
  const [ouverte, setOuverte] = useState<string | null>(null)

  /* Toute remise à zéro de filtre ramène à la première page : rester en
     page 4 d'un jeu de résultats qui n'en compte plus qu'une affiche un
     tableau vide qu'on prend pour « aucun résultat ». */
  const filtrer = (f: () => void) => { f(); setPage(0) }

  const facettes = useQuery({
    queryKey: ['security', 'audit', 'facets'],
    queryFn:  () => securityApi.auditFacets(),
    retry: false,
    staleTime: 300_000,
  })

  const journal = useQuery({
    queryKey: ['security', 'audit', recherche, utilisateur, table, action, periode, page],
    queryFn:  () => securityApi.audit({
      q:       recherche || undefined,
      user_id: utilisateur === TOUT ? undefined : utilisateur,
      table:   table       === TOUT ? undefined : table,
      action:  action      === TOUT ? undefined : action,
      period:  periode,
      limit:   PAR_PAGE,
      offset:  page * PAR_PAGE,
    }),
    retry: false,
    /* Garde la page précédente pendant le chargement de la suivante :
       sinon le tableau clignote et saute à chaque changement de page. */
    placeholderData: keepPreviousData,
  })

  const lignes = journal.data?.rows ?? []

  return (
    <div className="space-y-4">
      {/* ══ Filtres ═══════════════════════════════════════════════ */}
      <div className="card-premium p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') filtrer(() => setRech(q)) }}
              onBlur={() => filtrer(() => setRech(q))}
              placeholder="Rechercher une action, une table, une personne…"
              className="h-8 text-sm pl-8"
            />
          </div>

          <Select value={utilisateur} onValueChange={v => filtrer(() => setUti(v))}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[10rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TOUT}>Tous les utilisateurs</SelectItem>
              {(facettes.data?.utilisateurs ?? []).map(u => (
                <SelectItem key={u.id} value={u.id}>{u.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={table} onValueChange={v => filtrer(() => setTable(v))}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[9rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TOUT}>Tous les modules</SelectItem>
              {(facettes.data?.tables ?? []).map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={action} onValueChange={v => filtrer(() => setAction(v))}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[8rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TOUT}>Toutes les actions</SelectItem>
              {(facettes.data?.actions ?? []).map(a => (
                <SelectItem key={a} value={a}>{ACTION_LABEL[a] ?? a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filtres rapides de période */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            ['today', "Aujourd'hui"], ['7d', '7 derniers jours'],
            ['30d', '30 derniers jours'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => filtrer(() => setPeriode(v))}
              className={`px-2.5 h-7 rounded-lg text-[11px] font-medium border transition-colors ${
                periode === v
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-[var(--surface-input)] text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ Journal ═══════════════════════════════════════════════ */}
      <div className="card-premium overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" /> Journal d'audit
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground tabular-nums">
              Page {page + 1}
            </span>
            <Button
              size="sm" variant="outline" className="h-7 w-7 p-0"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || journal.isFetching}
              title="Page précédente"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm" variant="outline" className="h-7 w-7 p-0"
              onClick={() => setPage(p => p + 1)}
              disabled={!journal.data?.hasMore || journal.isFetching}
              title="Page suivante"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {journal.error ? (
          <div className="p-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {String((journal.error as Error).message)}
          </div>
        ) : journal.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : lignes.length === 0 ? (
          <div className="py-10 text-center">
            <Inbox className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Aucune entrée pour ces critères.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium">Utilisateur</th>
                  <th className="px-4 py-2.5 text-left font-medium">Action</th>
                  <th className="px-4 py-2.5 text-left font-medium">Module</th>
                  <th className="px-4 py-2.5 text-left font-medium">IP</th>
                  <th className="px-4 py-2.5 text-right font-medium">Détail</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(l => {
                  const depliee = ouverte === l.id
                  return (
                    <>
                      <tr key={l.id} className="table-row border-t border-border">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmt(l.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          {l.user_name
                            ? <span className="font-medium text-foreground">{l.user_name}</span>
                            /* Les écritures antérieures au suivi de l'auteur,
                               et celles des traitements internes, n'ont
                               personne à nommer. Le dire vaut mieux qu'une
                               case vide qu'on prend pour un bug. */
                            : <span className="text-muted-foreground italic">Système</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            ACTION_STYLE[l.action] ?? 'bg-muted text-muted-foreground'}`}>
                            {ACTION_LABEL[l.action] ?? l.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{l.table_name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{l.ip_address ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm" variant="ghost" className="h-7 text-[11px]"
                            onClick={() => setOuverte(depliee ? null : l.id)}
                          >
                            {depliee
                              ? <><ChevronUp className="w-3 h-3" /> Masquer</>
                              : <><ChevronDown className="w-3 h-3" /> Voir</>}
                          </Button>
                        </td>
                      </tr>
                      {depliee && (
                        <tr key={`${l.id}-detail`} className="border-t border-border bg-muted/20">
                          <td colSpan={6} className="px-4 py-3">
                            <Differences ligne={l} />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
