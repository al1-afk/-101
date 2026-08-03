/**
 * Calculs financiers — module PUR (aucune dépendance React/réseau).
 *
 * Toute la page Dépenses/Finances lit ses chiffres d'ici : un seul
 * endroit à relire pour vérifier une formule, un seul endroit à tester.
 * Les mêmes formules existent en SQL dans la vue `bank_accounts_with_solde`
 * (migration 083) — la route GET /api/finance/soldes permet de comparer
 * les deux et de détecter toute divergence.
 *
 * ── Règles de cohérence ────────────────────────────────────────────
 *   Revenu encaissé   → + compte      Dépense payée → − compte
 *   Transfert         → − source, + destination (patrimoine inchangé)
 *   Ajustement manuel → + différence (ni revenu ni dépense)
 *   Prévision         → n'impacte RIEN tant qu'elle n'est pas réalisée
 */

/* ── Formes minimales attendues (structural typing) ───────────────── */
export interface AccountLike {
  id: string
  nom?: string
  icon?: string | null
  couleur?: string | null
  devise?: string
  actif?: boolean
  solde_initial: number | string
}
export interface RevenuLike {
  id: string; montant: number | string; date_revenu: string
  bank_account_id: string | null; description?: string | null
  source?: string | null; categorie?: string | null; created_at?: string
}
export interface DepenseLike {
  id: string; montant: number | string; date_depense: string
  bank_account_id: string | null; description?: string | null
  categorie?: string | null; created_at?: string
}
export interface PaiementLike {
  id: string; montant: number | string; date: string; status: string
  bank_account_id: string | null; notes?: string | null
  reference?: string | null; created_at?: string
}
export interface TransfertLike {
  id: string; montant: number | string; date_transfert: string
  compte_source_id: string; compte_destination_id: string
  note?: string | null; created_at?: string
}
export interface AjustementLike {
  id: string; difference: number | string; date_ajustement: string
  bank_account_id: string; ancien_solde?: number | string
  nouveau_solde?: number | string; motif?: string; note?: string | null
  created_at?: string
}
export type PrevisionSens = 'revenu' | 'depense'
export type PrevisionStatut = 'prevu' | 'facture' | 'en_retard' | 'recu' | 'paye' | 'annule'
export interface PrevisionLike {
  id: string; sens: PrevisionSens; montant: number | string
  date_prevue: string; statut: PrevisionStatut
  bank_account_id: string | null; description?: string | null
  source?: string | null; categorie?: string | null
  montant_realise?: number | string | null; date_realisation?: string | null
  created_at?: string
}

export interface FinanceData {
  accounts?:    AccountLike[]
  revenus?:     RevenuLike[]
  depenses?:    DepenseLike[]
  paiements?:   PaiementLike[]
  transferts?:  TransfertLike[]
  ajustements?: AjustementLike[]
  previsions?:  PrevisionLike[]
}

/* ── Utilitaires ─────────────────────────────────────────────────── */

/** Postgres renvoie parfois les NUMERIC en chaîne : on normalise. */
export function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Arrondi comptable au centime — évite les 0.1+0.2 = 0.30000000000000004. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function formatDH(n: number, devise = 'MAD'): string {
  const unit = !devise || devise === 'MAD' ? 'DH' : devise
  return `${num(n).toLocaleString('fr-FR', {
    minimumFractionDigits: Number.isInteger(round2(n)) ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${unit}`
}

/** Seuls les paiements encaissés sont sur le compte. */
const isEncaisse = (p: PaiementLike) => p.status === 'paye'

/* ── Prévisions ──────────────────────────────────────────────────── */

/** Statuts qui pèsent encore dans le prévisionnel. */
export const PREVISION_STATUTS_ACTIFS: PrevisionStatut[] = ['prevu', 'facture', 'en_retard']

export function isPrevisionActive(p: PrevisionLike): boolean {
  return PREVISION_STATUTS_ACTIFS.includes(p.statut)
}

/**
 * Statut affiché : « en retard » est une conséquence de la date, pas une
 * saisie. Une prévision active dont la date est passée est en retard,
 * quel que soit son statut stocké.
 */
export function effectiveStatut(p: PrevisionLike, today = new Date().toISOString().slice(0, 10)): PrevisionStatut {
  if (!isPrevisionActive(p)) return p.statut
  return p.date_prevue && p.date_prevue < today ? 'en_retard' : p.statut
}

export function totalPrevisions(previsions: PrevisionLike[] = [], sens: PrevisionSens): number {
  return round2(
    previsions
      .filter(p => p.sens === sens && isPrevisionActive(p))
      .reduce((s, p) => s + num(p.montant), 0)
  )
}

/* ── Soldes par compte ───────────────────────────────────────────── */

export interface AccountBalance {
  id: string
  solde: number
  solde_initial: number
  total_entrees: number            // revenus + paiements encaissés
  total_sorties: number            // dépenses
  total_transferts_entrants: number
  total_transferts_sortants: number
  total_ajustements: number
}

/**
 * solde = solde_initial
 *       + paiements encaissés + revenus + transferts entrants + ajustements
 *       − dépenses − transferts sortants
 */
export function computeAccountBalances(data: FinanceData): Map<string, AccountBalance> {
  const {
    accounts = [], revenus = [], depenses = [],
    paiements = [], transferts = [], ajustements = [],
  } = data

  const result = new Map<string, AccountBalance>()
  for (const a of accounts) {
    result.set(a.id, {
      id: a.id,
      solde: 0,
      solde_initial: num(a.solde_initial),
      total_entrees: 0,
      total_sorties: 0,
      total_transferts_entrants: 0,
      total_transferts_sortants: 0,
      total_ajustements: 0,
    })
  }

  const bump = (id: string | null, key: keyof AccountBalance, v: number) => {
    if (!id) return
    const b = result.get(id)
    if (!b) return               // mouvement rattaché à un compte supprimé
    ;(b[key] as number) += v
  }

  for (const p of paiements) if (isEncaisse(p)) bump(p.bank_account_id, 'total_entrees', num(p.montant))
  for (const r of revenus)    bump(r.bank_account_id, 'total_entrees', num(r.montant))
  for (const d of depenses)   bump(d.bank_account_id, 'total_sorties', num(d.montant))
  for (const t of transferts) {
    bump(t.compte_source_id,      'total_transferts_sortants', num(t.montant))
    bump(t.compte_destination_id, 'total_transferts_entrants', num(t.montant))
  }
  for (const j of ajustements) bump(j.bank_account_id, 'total_ajustements', num(j.difference))

  for (const b of result.values()) {
    b.solde = round2(
      b.solde_initial + b.total_entrees + b.total_transferts_entrants + b.total_ajustements
      - b.total_sorties - b.total_transferts_sortants
    )
    b.total_entrees             = round2(b.total_entrees)
    b.total_sorties             = round2(b.total_sorties)
    b.total_transferts_entrants = round2(b.total_transferts_entrants)
    b.total_transferts_sortants = round2(b.total_transferts_sortants)
    b.total_ajustements         = round2(b.total_ajustements)
  }
  return result
}

/** Argent réellement disponible = somme des soldes réels de tous les comptes. */
export function computeDisponible(data: FinanceData): number {
  let total = 0
  for (const b of computeAccountBalances(data).values()) total += b.solde
  return round2(total)
}

/* ── Synthèse dashboard ──────────────────────────────────────────── */

export interface FinanceSummary {
  disponible: number
  revenusMois: number
  depensesMois: number
  resultatNet: number
  revenusPrevus: number
  depensesPrevues: number
  soldePrevisionnel: number
}

/** `monthPrefix` = 'YYYY-MM'. */
export function computeSummary(data: FinanceData, monthPrefix: string): FinanceSummary {
  const { revenus = [], depenses = [], paiements = [], previsions = [] } = data

  const inMonth = (d?: string | null) => !!d && d.startsWith(monthPrefix)

  const revenusMois = round2(
    revenus.filter(r => inMonth(r.date_revenu)).reduce((s, r) => s + num(r.montant), 0)
    + paiements.filter(p => isEncaisse(p) && inMonth(p.date)).reduce((s, p) => s + num(p.montant), 0)
  )
  const depensesMois = round2(
    depenses.filter(d => inMonth(d.date_depense)).reduce((s, d) => s + num(d.montant), 0)
  )

  const disponible      = computeDisponible(data)
  const revenusPrevus   = totalPrevisions(previsions, 'revenu')
  const depensesPrevues = totalPrevisions(previsions, 'depense')

  return {
    disponible,
    revenusMois,
    depensesMois,
    resultatNet:       round2(revenusMois - depensesMois),
    revenusPrevus,
    depensesPrevues,
    /* Prévisionnel = ce que j'ai + ce qui doit rentrer − ce qui doit sortir.
       Jamais saisi à la main : toujours recalculé. */
    soldePrevisionnel: round2(disponible + revenusPrevus - depensesPrevues),
  }
}

/* ── Historique unifié ───────────────────────────────────────────── */

export type MovementType =
  | 'revenu' | 'paiement' | 'depense'
  | 'transfert_entrant' | 'transfert_sortant' | 'ajustement'

export interface Movement {
  key: string                       // clé React stable
  id: string
  date: string
  type: MovementType
  label: string
  account_id: string | null
  contre_partie_id?: string | null  // compte opposé d'un transfert
  entree: number                    // 0 si sortie
  sortie: number                    // 0 si entrée
  /* Solde du compte APRÈS ce mouvement. `null` quand le mouvement n'est
     rattaché à aucun compte (compte supprimé → bank_account_id mis à
     NULL) : afficher un solde reconstitué à partir de zéro serait faux. */
  solde: number | null
  created_at?: string
}

const LABEL_FALLBACK: Record<MovementType, string> = {
  revenu:            'Revenu',
  paiement:          'Paiement encaissé',
  depense:           'Dépense',
  transfert_entrant: 'Transfert reçu',
  transfert_sortant: 'Transfert émis',
  ajustement:        'Ajustement de solde',
}

/**
 * Journal de tous les mouvements réels, du plus récent au plus ancien,
 * avec le solde du compte après chaque ligne.
 *
 * Le solde courant est reconstitué en parcourant les mouvements du plus
 * ANCIEN au plus récent à partir du solde initial : la colonne « Solde »
 * explique donc réellement pourquoi le compte en est là.
 */
export function buildMovements(data: FinanceData, accountId?: string | null): Movement[] {
  const {
    accounts = [], revenus = [], depenses = [],
    paiements = [], transferts = [], ajustements = [],
  } = data

  const keep = (id: string | null) => !accountId || id === accountId
  const raw: Omit<Movement, 'solde'>[] = []

  for (const r of revenus) {
    if (!keep(r.bank_account_id)) continue
    raw.push({
      key: `revenu-${r.id}`, id: r.id, date: r.date_revenu, type: 'revenu',
      label: r.description || r.source || LABEL_FALLBACK.revenu,
      account_id: r.bank_account_id, entree: num(r.montant), sortie: 0,
      created_at: r.created_at,
    })
  }
  for (const p of paiements) {
    if (!isEncaisse(p) || !keep(p.bank_account_id)) continue
    raw.push({
      key: `paiement-${p.id}`, id: p.id, date: p.date, type: 'paiement',
      label: p.notes || p.reference || LABEL_FALLBACK.paiement,
      account_id: p.bank_account_id, entree: num(p.montant), sortie: 0,
      created_at: p.created_at,
    })
  }
  for (const d of depenses) {
    if (!keep(d.bank_account_id)) continue
    raw.push({
      key: `depense-${d.id}`, id: d.id, date: d.date_depense, type: 'depense',
      label: d.description || d.categorie || LABEL_FALLBACK.depense,
      account_id: d.bank_account_id, entree: 0, sortie: num(d.montant),
      created_at: d.created_at,
    })
  }
  for (const t of transferts) {
    if (keep(t.compte_destination_id)) {
      raw.push({
        key: `transfert-in-${t.id}`, id: t.id, date: t.date_transfert, type: 'transfert_entrant',
        label: t.note || LABEL_FALLBACK.transfert_entrant,
        account_id: t.compte_destination_id, contre_partie_id: t.compte_source_id,
        entree: num(t.montant), sortie: 0, created_at: t.created_at,
      })
    }
    if (keep(t.compte_source_id)) {
      raw.push({
        key: `transfert-out-${t.id}`, id: t.id, date: t.date_transfert, type: 'transfert_sortant',
        label: t.note || LABEL_FALLBACK.transfert_sortant,
        account_id: t.compte_source_id, contre_partie_id: t.compte_destination_id,
        entree: 0, sortie: num(t.montant), created_at: t.created_at,
      })
    }
  }
  for (const j of ajustements) {
    if (!keep(j.bank_account_id)) continue
    const diff = num(j.difference)
    raw.push({
      key: `ajustement-${j.id}`, id: j.id, date: j.date_ajustement, type: 'ajustement',
      label: j.note || LABEL_FALLBACK.ajustement,
      account_id: j.bank_account_id,
      entree: diff > 0 ? diff : 0, sortie: diff < 0 ? -diff : 0,
      created_at: j.created_at,
    })
  }

  /* Ordre chronologique croissant pour dérouler les soldes. */
  raw.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const ca = a.created_at ?? '', cb = b.created_at ?? ''
    if (ca !== cb) return ca < cb ? -1 : 1
    return a.key < b.key ? -1 : 1
  })

  const running = new Map<string, number>()
  for (const a of accounts) running.set(a.id, num(a.solde_initial))

  const withSolde: Movement[] = raw.map(m => {
    const acc = m.account_id
    /* Compte inconnu (supprimé) : le mouvement reste visible dans le
       journal, mais sans solde inventé. */
    if (!acc || !running.has(acc)) return { ...m, solde: null }
    const after = round2((running.get(acc) as number) + m.entree - m.sortie)
    running.set(acc, after)
    return { ...m, solde: after }
  })

  return withSolde.reverse()
}

/**
 * Date locale au format YYYY-MM-DD.
 *
 * `toISOString()` convertit en UTC : au Maroc (UTC+1) le dernier jour du
 * mois à minuit devient la veille, et les mouvements de ce jour-là
 * sortaient du calcul. On formate donc en heure locale.
 */
export function toISODateLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export interface MonthlyPoint { month: string; label: string; solde: number }

/** Solde d'un compte à la fin de chacun des `monthsBack` derniers mois. */
export function computeMonthlyHistory(
  data: FinanceData,
  accountId: string | null,
  monthsBack = 12,
  now = new Date(),
): MonthlyPoint[] {
  if (!accountId) return []
  const account = (data.accounts ?? []).find(a => a.id === accountId)
  if (!account) return []

  const movements = buildMovements(data, accountId)
  const initial = num(account.solde_initial)

  const history: MonthlyPoint[] = []
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0) // dernier jour du mois
    const endStr = toISODateLocal(d)
    const delta = movements
      .filter(m => m.date && m.date <= endStr && m.account_id === accountId)
      .reduce((s, m) => s + m.entree - m.sortie, 0)
    history.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('fr-FR', { month: 'short', year: '2-digit' }),
      solde: round2(initial + delta),
    })
  }
  return history
}

/** Lignes « prévisionnelles » du journal — informatives, sans impact solde. */
export interface PrevisionEntry {
  key: string
  id: string
  date: string
  type: 'revenu_prevu' | 'depense_prevue'
  label: string
  account_id: string | null
  montant: number
  statut: PrevisionStatut
}

export function buildPrevisionEntries(
  previsions: PrevisionLike[] = [],
  accountId?: string | null,
  today = new Date().toISOString().slice(0, 10),
): PrevisionEntry[] {
  return previsions
    .filter(p => isPrevisionActive(p))
    .filter(p => !accountId || p.bank_account_id === accountId)
    .map(p => ({
      key: `prevision-${p.id}`,
      id: p.id,
      date: p.date_prevue,
      type: p.sens === 'revenu' ? 'revenu_prevu' as const : 'depense_prevue' as const,
      label: p.description || p.source || (p.sens === 'revenu' ? 'Revenu prévu' : 'Dépense prévue'),
      account_id: p.bank_account_id,
      montant: num(p.montant),
      statut: effectiveStatut(p, today),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}
