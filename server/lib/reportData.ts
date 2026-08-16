/**
 * Collecte des données pour les notifications et rapports automatiques.
 *
 * Un seul endroit où l'on décide CE QUI compte comme « en retard »,
 * « non terminé » ou « pas encore contacté » — les quatre envois
 * (alerte tâches, alerte contacts, rapport quotidien, rapport
 * hebdomadaire) tapent tous dans ces mêmes fonctions, donc les chiffres
 * d'un mail ne peuvent pas contredire ceux d'un autre.
 *
 * ── Choix de périmètre ───────────────────────────────────────────────
 * Les tâches viennent de `team_member_tasks` : c'est la table qui porte
 * le travail réel de l'agence (projets, équipe, stagiaires, admin). Les
 * tables héritées `taches` / `personal_tasks` / `client_tasks` ne sont
 * pas lues : la première n'existe pas en base, les deux autres sont
 * vides et leur schéma a divergé des migrations (colonnes renommées) —
 * les interroger ferait planter le scheduler selon l'environnement.
 *
 * ── Requêtes hors RLS, volontairement ────────────────────────────────
 * Ces fonctions tournent dans un job de fond, sans requête HTTP ni
 * utilisateur : elles utilisent le pool direct comme les autres
 * schedulers du projet (expiryReminderScheduler, outboundAutopilot).
 * Le cloisonnement est assuré par le `tenant_id = $1` explicite présent
 * dans CHAQUE requête — jamais implicite.
 */
import type { Pool } from 'pg'
import { logger } from './logger'

/* Nombre de lignes détaillées dans un email. Au-delà, on affiche le
   compte total + un lien vers l'application : un mail de 200 lignes
   n'est pas lu. */
export const LIST_LIMIT = 15

/* ─────────────────────────────────────────────────────────────────────
   Résolution de colonnes — la base vivante a divergé des migrations
   (paiements.date vs paiements.date_paiement, présence ou non de
   paiements.status). Plutôt que de parier, on regarde le schéma une
   fois et on mémorise.
───────────────────────────────────────────────────────────────────── */
const columnCache = new Map<string, string | null>()

async function pickColumn(pool: Pool, table: string, candidates: string[]): Promise<string | null> {
  const cacheKey = `${table}:${candidates.join('|')}`
  const cached = columnCache.get(cacheKey)
  if (cached !== undefined) return cached

  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2)`,
    [table, candidates],
  )
  const found = candidates.find(c => rows.some(r => r.column_name === c)) ?? null
  if (!found) {
    logger.warn(`[reports] aucune colonne ${candidates.join('/')} sur ${table} — métrique ignorée`)
  }
  columnCache.set(cacheKey, found)
  return found
}

/** Réinitialise le cache de schéma (tests, ou après migration). */
export function resetColumnCache(): void { columnCache.clear() }

/* ─────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────── */

export interface TaskRow {
  id:        string
  title:     string
  status:    string
  priority:  string
  due_date:  string | null
  days_late: number | null       // > 0 = jours de retard
  idle_days: number | null       // jours sans aucune modification
  assignee:  string | null
  projet:    string | null
  project_id: string | null
}

export interface TasksSnapshot {
  overdue: TaskRow[]          // échéance dépassée
  today:   TaskRow[]          // à rendre aujourd'hui
  soon:    TaskRow[]          // échéance dans les 7 jours
  stale:   TaskRow[]          // sans échéance et sans mouvement depuis N jours
  validation: TaskRow[]       // terminées par l'équipe, en attente de validation
  counts: {
    overdue: number
    today:   number
    soon:    number
    stale:   number
    validation: number
    open:    number           // toutes tâches non terminées
    unassigned: number
  }
}

export interface ContactRow {
  id:         string
  nom:        string
  entreprise: string | null
  email:      string | null
  telephone:  string | null
  statut:     string | null
  days:       number | null    // ancienneté (création ou dernier contact)
}

export interface ContactsSnapshot {
  clients_never:     ContactRow[]   // aucun contact enregistré
  clients_stale:     ContactRow[]   // plus de contact depuis N jours
  prospects_never:   ContactRow[]   // jamais contactés
  prospects_relance: ContactRow[]   // relance prévue aujourd'hui ou dépassée
  counts: {
    clients_never: number
    clients_stale: number
    prospects_never: number
    prospects_relance: number
    total: number
  }
}

export interface PriorityRow {
  label:  string
  detail: string | null
  urgency: 'critical' | 'warning' | 'info'
}

export interface DailySnapshot {
  date:       string            // jour local YYYY-MM-DD
  done:       TaskRow[]         // tâches terminées dans la journée
  done_count: number
  tasks:      TasksSnapshot
  contacts:   ContactsSnapshot
  priorities: PriorityRow[]
}

export interface PersonStat { assignee: string; done: number }

export interface WeeklySnapshot {
  from: string
  to:   string
  done_count:  number
  done_by_person: PersonStat[]
  done_sample: TaskRow[]
  tasks:    TasksSnapshot
  contacts: ContactsSnapshot
  contacted_clients:   number
  contacted_prospects: number
  results: {
    devis_acceptes:      { count: number; montant: number }
    devis_envoyes:       { count: number; montant: number }
    factures_emises:     { count: number; montant: number }
    encaissements:       number
    nouveaux_clients:    number
    nouveaux_prospects:  number
    projets_termines:    number
  }
  next_actions: PriorityRow[]
}

/* ─────────────────────────────────────────────────────────────────────
   Sélection commune des tâches (jointures d'affectation)

   Une tâche peut être portée par un membre d'équipe, par un utilisateur
   admin, par un stagiaire, ou par personne. On résout un nom lisible une
   fois pour toutes.
───────────────────────────────────────────────────────────────────── */
const TASK_SELECT = `
  k.id, k.title, k.status, k.priority, to_char(k.due_date, 'YYYY-MM-DD') AS due_date,
  k.project_id, pj.nom AS projet,
  NULLIF(TRIM(COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', tm.prenom, tm.nom)), ''),
    NULLIF(TRIM(u.name), ''),
    u.email,
    st.nom_complet
  )), '') AS assignee`

const TASK_JOINS = `
  FROM public.team_member_tasks k
  LEFT JOIN public.team_members tm ON tm.id = k.team_member_id
  LEFT JOIN public.users        u  ON u.id  = k.assigned_user_id
  LEFT JOIN public.stagiaires   st ON st.id = k.assigned_stagiaire_id
  LEFT JOIN public.projets      pj ON pj.id = k.project_id`

/* Urgent d'abord, puis haute, normale, basse. */
const PRIORITY_RANK = `CASE k.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`

const OPEN_STATUSES = `k.status NOT IN ('done','cancelled')`

/* ─────────────────────────────────────────────────────────────────────
   1. Tâches — en retard, du jour, à venir, dormantes
───────────────────────────────────────────────────────────────────── */
export async function collectTasks(
  pool: Pool,
  tenantId: string,
  localDate: string,
  staleDays: number,
): Promise<TasksSnapshot> {
  /* Une seule requête pour les listes : la classification est faite en
     SQL (bucket), le découpage en TypeScript. Évite 4 allers-retours. */
  const { rows } = await pool.query<TaskRow & { bucket: string }>(`
    SELECT ${TASK_SELECT},
      ($2::date - k.due_date)                              AS days_late,
      (($2::date) - (k.updated_at AT TIME ZONE 'UTC')::date) AS idle_days,
      CASE
        WHEN k.status = 'validation'                       THEN 'validation'
        WHEN k.due_date IS NOT NULL AND k.due_date <  $2::date THEN 'overdue'
        WHEN k.due_date = $2::date                         THEN 'today'
        WHEN k.due_date IS NOT NULL AND k.due_date <= $2::date + 7 THEN 'soon'
        WHEN k.due_date IS NULL
             AND k.updated_at < NOW() - make_interval(days => $3::int) THEN 'stale'
        ELSE 'other'
      END AS bucket
    ${TASK_JOINS}
    WHERE k.tenant_id = $1
      AND ${OPEN_STATUSES}
    ORDER BY
      k.due_date ASC NULLS LAST,
      ${PRIORITY_RANK},
      k.updated_at ASC
  `, [tenantId, localDate, staleDays])

  const pick = (b: string) => rows.filter(r => r.bucket === b)
  /* Les tâches en validation sont extraites AVANT le classement par
     échéance : une tâche finie qui attend une validation n'est pas
     « en retard », elle attend une action de l'admin. */
  const validation = pick('validation')
  const overdue = pick('overdue')
  const today   = pick('today')
  const soon    = pick('soon')
  const stale   = pick('stale')

  return {
    overdue: overdue.slice(0, LIST_LIMIT),
    today:   today.slice(0, LIST_LIMIT),
    soon:    soon.slice(0, LIST_LIMIT),
    stale:   stale.slice(0, LIST_LIMIT),
    validation: validation.slice(0, LIST_LIMIT),
    counts: {
      overdue:    overdue.length,
      today:      today.length,
      soon:       soon.length,
      stale:      stale.length,
      validation: validation.length,
      open:       rows.length,
      unassigned: rows.filter(r => !r.assignee).length,
    },
  }
}

/** Tâches terminées sur une plage de jours locaux (bornes incluses). */
export async function collectDoneTasks(
  pool: Pool,
  tenantId: string,
  timezone: string,
  fromDate: string,
  toDate: string,
): Promise<TaskRow[]> {
  const { rows } = await pool.query<TaskRow>(`
    SELECT ${TASK_SELECT}, NULL::int AS days_late, NULL::int AS idle_days
    ${TASK_JOINS}
    WHERE k.tenant_id = $1
      AND k.status = 'done'
      AND k.completed_at IS NOT NULL
      AND (k.completed_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
    ORDER BY k.completed_at DESC
  `, [tenantId, timezone, fromDate, toDate])
  return rows
}

/* ─────────────────────────────────────────────────────────────────────
   2. Clients & prospects à contacter

   Quatre populations distinctes, volontairement séparées : « je ne l'ai
   jamais appelé » et « je ne l'ai pas rappelé depuis 3 semaines » n'ont
   pas la même urgence ni la même action.
───────────────────────────────────────────────────────────────────── */
export async function collectContacts(
  pool: Pool,
  tenantId: string,
  localDate: string,
  contactDelayDays: number,
  newLeadGraceDays: number,
): Promise<ContactsSnapshot> {
  /* Clients jamais contactés — les « Nouveau » remontent en tête, puis
     les plus récemment créés : c'est là que le rappel a le plus de valeur. */
  const clientsNever = await pool.query<ContactRow>(`
    SELECT c.id, c.nom, c.entreprise, c.email, c.telephone, c.statut,
           ($2::date - c.created_at::date) AS days
      FROM public.clients c
     WHERE c.tenant_id = $1
       AND c.date_dernier_contact IS NULL
     ORDER BY (LOWER(COALESCE(c.statut, '')) = 'nouveau') DESC, c.created_at DESC
  `, [tenantId, localDate])

  const clientsStale = await pool.query<ContactRow>(`
    SELECT c.id, c.nom, c.entreprise, c.email, c.telephone, c.statut,
           ($2::date - c.date_dernier_contact::date) AS days
      FROM public.clients c
     WHERE c.tenant_id = $1
       AND c.date_dernier_contact IS NOT NULL
       AND c.date_dernier_contact < NOW() - make_interval(days => $3::int)
     ORDER BY c.date_dernier_contact ASC
  `, [tenantId, localDate, contactDelayDays])

  /* Prospects jamais contactés : on laisse passer le délai de grâce pour
     ne pas alerter sur un lead arrivé il y a deux heures. */
  const prospectsNever = await pool.query<ContactRow>(`
    SELECT p.id, p.nom, p.entreprise, p.email, p.telephone, p.statut,
           ($2::date - p.created_at::date) AS days
      FROM public.prospects p
     WHERE p.tenant_id = $1
       AND p.date_contact IS NULL
       AND COALESCE(p.statut, '') NOT IN ('gagne','perdu')
       AND p.created_at < NOW() - make_interval(days => $3::int)
     ORDER BY p.created_at ASC
  `, [tenantId, localDate, newLeadGraceDays])

  /* Relances échues : date_relance (jour) OU relance_at (heure précise). */
  const prospectsRelance = await pool.query<ContactRow>(`
    SELECT p.id, p.nom, p.entreprise, p.email, p.telephone, p.statut,
           ($2::date - COALESCE(p.date_relance, p.relance_at::date)) AS days
      FROM public.prospects p
     WHERE p.tenant_id = $1
       AND COALESCE(p.statut, '') NOT IN ('gagne','perdu')
       AND (
         (p.date_relance IS NOT NULL AND p.date_relance <= $2::date)
         OR (p.relance_at IS NOT NULL AND p.relance_at <= NOW())
       )
     ORDER BY COALESCE(p.date_relance, p.relance_at::date) ASC
  `, [tenantId, localDate])

  const counts = {
    clients_never:     clientsNever.rowCount ?? 0,
    clients_stale:     clientsStale.rowCount ?? 0,
    prospects_never:   prospectsNever.rowCount ?? 0,
    prospects_relance: prospectsRelance.rowCount ?? 0,
    total: 0,
  }
  counts.total = counts.clients_never + counts.clients_stale
               + counts.prospects_never + counts.prospects_relance

  return {
    clients_never:     clientsNever.rows.slice(0, LIST_LIMIT),
    clients_stale:     clientsStale.rows.slice(0, LIST_LIMIT),
    prospects_never:   prospectsNever.rows.slice(0, LIST_LIMIT),
    prospects_relance: prospectsRelance.rows.slice(0, LIST_LIMIT),
    counts,
  }
}

/* ─────────────────────────────────────────────────────────────────────
   3. Actions prioritaires

   Ce que le rapport quotidien met en tête : ce qui coûte de l'argent ou
   de la crédibilité si on ne le fait pas aujourd'hui.
───────────────────────────────────────────────────────────────────── */
export async function collectPriorities(
  pool: Pool,
  tenantId: string,
  localDate: string,
  tasks: TasksSnapshot,
  contacts: ContactsSnapshot,
): Promise<PriorityRow[]> {
  const out: PriorityRow[] = []

  const urgentLate = tasks.overdue.filter(t => t.priority === 'urgent' || t.priority === 'high')
  if (urgentLate.length) {
    out.push({
      urgency: 'critical',
      label:   `${urgentLate.length} tâche${urgentLate.length > 1 ? 's' : ''} prioritaire${urgentLate.length > 1 ? 's' : ''} en retard`,
      detail:  urgentLate.slice(0, 3).map(t => t.title).join(' · '),
    })
  } else if (tasks.counts.overdue) {
    out.push({
      urgency: 'warning',
      label:   `${tasks.counts.overdue} tâche${tasks.counts.overdue > 1 ? 's' : ''} en retard`,
      detail:  tasks.overdue.slice(0, 3).map(t => t.title).join(' · '),
    })
  }

  if (contacts.counts.prospects_relance) {
    out.push({
      urgency: 'critical',
      label:   `${contacts.counts.prospects_relance} relance${contacts.counts.prospects_relance > 1 ? 's' : ''} prospect à passer`,
      detail:  contacts.prospects_relance.slice(0, 3).map(p => p.entreprise || p.nom).join(' · '),
    })
  }

  if (tasks.counts.validation) {
    out.push({
      urgency: 'warning',
      label:   `${tasks.counts.validation} tâche${tasks.counts.validation > 1 ? 's' : ''} en attente de votre validation`,
      detail:  tasks.validation.slice(0, 3).map(t => t.title).join(' · '),
    })
  }

  /* Factures échues impayées — de l'argent dû, daté. */
  try {
    const { rows } = await pool.query<{ nb: string; total: number }>(`
      SELECT COUNT(*)::text AS nb,
             COALESCE(SUM(COALESCE(f.montant_ttc, 0) - COALESCE(f.montant_paye, 0)), 0) AS total
        FROM public.factures f
       WHERE f.tenant_id = $1
         AND f.date_echeance IS NOT NULL
         AND f.date_echeance < $2::date
         AND LOWER(f.statut::text) IN ('impayee','partielle','envoyee')
    `, [tenantId, localDate])
    const nb = Number(rows[0]?.nb ?? 0)
    if (nb > 0) {
      out.push({
        urgency: 'critical',
        label:   `${nb} facture${nb > 1 ? 's' : ''} échue${nb > 1 ? 's' : ''} non réglée${nb > 1 ? 's' : ''}`,
        detail:  `${fmtMoney(Number(rows[0].total))} à recouvrer`,
      })
    }
  } catch (e: any) {
    logger.warn('[reports] factures échues indisponibles :', e?.message)
  }

  /* Devis envoyés sans réponse depuis plus d'une semaine. */
  try {
    const { rows } = await pool.query<{ nb: string; total: number }>(`
      SELECT COUNT(*)::text AS nb, COALESCE(SUM(d.montant_ttc), 0) AS total
        FROM public.devis d
       WHERE d.tenant_id = $1
         AND LOWER(d.statut::text) = 'envoye'
         AND d.date_emission < $2::date - 7
    `, [tenantId, localDate])
    const nb = Number(rows[0]?.nb ?? 0)
    if (nb > 0) {
      out.push({
        urgency: 'warning',
        label:   `${nb} devis sans réponse depuis plus de 7 jours`,
        detail:  `${fmtMoney(Number(rows[0].total))} en attente de décision`,
      })
    }
  } catch (e: any) {
    logger.warn('[reports] devis en attente indisponibles :', e?.message)
  }

  if (contacts.counts.clients_never) {
    out.push({
      urgency: 'info',
      label:   `${contacts.counts.clients_never} client${contacts.counts.clients_never > 1 ? 's' : ''} sans aucun contact enregistré`,
      detail:  contacts.clients_never.slice(0, 3).map(c => c.entreprise || c.nom).join(' · '),
    })
  }

  return out
}

/* ─────────────────────────────────────────────────────────────────────
   4. Rapport quotidien
───────────────────────────────────────────────────────────────────── */
export async function buildDailySnapshot(
  pool: Pool,
  tenantId: string,
  opts: { timezone: string; localDate: string; staleDays: number; contactDelayDays: number; newLeadGraceDays: number },
): Promise<DailySnapshot> {
  const [tasks, contacts, done] = await Promise.all([
    collectTasks(pool, tenantId, opts.localDate, opts.staleDays),
    collectContacts(pool, tenantId, opts.localDate, opts.contactDelayDays, opts.newLeadGraceDays),
    collectDoneTasks(pool, tenantId, opts.timezone, opts.localDate, opts.localDate),
  ])
  const priorities = await collectPriorities(pool, tenantId, opts.localDate, tasks, contacts)

  return {
    date: opts.localDate,
    done: done.slice(0, LIST_LIMIT),
    done_count: done.length,
    tasks,
    contacts,
    priorities,
  }
}

/* ─────────────────────────────────────────────────────────────────────
   5. Rapport hebdomadaire
───────────────────────────────────────────────────────────────────── */
export async function buildWeeklySnapshot(
  pool: Pool,
  tenantId: string,
  opts: { timezone: string; localDate: string; staleDays: number; contactDelayDays: number; newLeadGraceDays: number },
): Promise<WeeklySnapshot> {
  /* Semaine glissante : les 7 jours qui précèdent, jour d'envoi inclus. */
  const to   = opts.localDate
  const from = shiftDate(opts.localDate, -6)

  const [tasks, contacts, done] = await Promise.all([
    collectTasks(pool, tenantId, opts.localDate, opts.staleDays),
    collectContacts(pool, tenantId, opts.localDate, opts.contactDelayDays, opts.newLeadGraceDays),
    collectDoneTasks(pool, tenantId, opts.timezone, from, to),
  ])

  /* Réalisé par personne */
  const byPerson = new Map<string, number>()
  for (const t of done) {
    const key = t.assignee ?? 'Non assignée'
    byPerson.set(key, (byPerson.get(key) ?? 0) + 1)
  }
  const done_by_person: PersonStat[] = [...byPerson.entries()]
    .map(([assignee, count]) => ({ assignee, done: count }))
    .sort((a, b) => b.done - a.done)

  const [contactedClients, contactedProspects, results, nextActions] = await Promise.all([
    countContactedClients(pool, tenantId, from, to),
    countContactedProspects(pool, tenantId, from, to),
    collectWeeklyResults(pool, tenantId, from, to),
    collectNextActions(pool, tenantId, opts.localDate, tasks, contacts),
  ])

  return {
    from, to,
    done_count: done.length,
    done_by_person,
    done_sample: done.slice(0, LIST_LIMIT),
    tasks,
    contacts,
    contacted_clients:   contactedClients,
    contacted_prospects: contactedProspects,
    results,
    next_actions: nextActions,
  }
}

async function countContactedClients(pool: Pool, tenantId: string, from: string, to: string): Promise<number> {
  const { rows } = await pool.query<{ nb: string }>(`
    SELECT COUNT(*)::text AS nb FROM public.clients c
     WHERE c.tenant_id = $1
       AND c.date_dernier_contact IS NOT NULL
       AND c.date_dernier_contact::date BETWEEN $2::date AND $3::date
  `, [tenantId, from, to])
  return Number(rows[0]?.nb ?? 0)
}

/**
 * Prospects effectivement travaillés sur la période : date de contact
 * posée dans la semaine, OU une trace d'appel/email dans le journal.
 */
async function countContactedProspects(pool: Pool, tenantId: string, from: string, to: string): Promise<number> {
  const { rows } = await pool.query<{ nb: string }>(`
    SELECT COUNT(DISTINCT p.id)::text AS nb
      FROM public.prospects p
     WHERE p.tenant_id = $1
       AND (
         (p.date_contact IS NOT NULL AND p.date_contact BETWEEN $2::date AND $3::date)
         OR EXISTS (
           SELECT 1 FROM public.prospect_logs l
            WHERE l.prospect_id = p.id
              AND l.tenant_id = $1
              AND l.type IN ('appel','email')
              AND l.created_at::date BETWEEN $2::date AND $3::date
         )
       )
  `, [tenantId, from, to])
  return Number(rows[0]?.nb ?? 0)
}

async function collectWeeklyResults(pool: Pool, tenantId: string, from: string, to: string) {
  const empty = { count: 0, montant: 0 }
  const results: WeeklySnapshot['results'] = {
    devis_acceptes:  { ...empty },
    devis_envoyes:   { ...empty },
    factures_emises: { ...empty },
    encaissements:   0,
    nouveaux_clients: 0,
    nouveaux_prospects: 0,
    projets_termines: 0,
  }

  /* Devis : « accepté » se lit sur le statut courant, daté par updated_at
     (il n'existe pas de colonne date_acceptation). */
  try {
    const { rows } = await pool.query<{ statut: string; nb: string; total: number }>(`
      SELECT LOWER(d.statut::text) AS statut, COUNT(*)::text AS nb, COALESCE(SUM(d.montant_ttc), 0) AS total
        FROM public.devis d
       WHERE d.tenant_id = $1
         AND (
           (LOWER(d.statut::text) = 'accepte' AND d.updated_at::date BETWEEN $2::date AND $3::date)
           OR (LOWER(d.statut::text) = 'envoye' AND d.date_emission BETWEEN $2::date AND $3::date)
         )
       GROUP BY 1
    `, [tenantId, from, to])
    for (const r of rows) {
      const bucket = r.statut === 'accepte' ? results.devis_acceptes : results.devis_envoyes
      bucket.count   = Number(r.nb)
      bucket.montant = Number(r.total)
    }
  } catch (e: any) {
    logger.warn('[reports] bilan devis indisponible :', e?.message)
  }

  try {
    const { rows } = await pool.query<{ nb: string; total: number }>(`
      SELECT COUNT(*)::text AS nb, COALESCE(SUM(f.montant_ttc), 0) AS total
        FROM public.factures f
       WHERE f.tenant_id = $1 AND f.date_emission BETWEEN $2::date AND $3::date
    `, [tenantId, from, to])
    results.factures_emises = { count: Number(rows[0]?.nb ?? 0), montant: Number(rows[0]?.total ?? 0) }
  } catch (e: any) {
    logger.warn('[reports] bilan factures indisponible :', e?.message)
  }

  /* Encaissements : paiements clients + revenus hors facturation.
     Les noms de colonnes de `paiements` ont divergé selon les
     environnements — on résout dynamiquement plutôt que de planter. */
  try {
    const dateCol   = await pickColumn(pool, 'paiements', ['date_paiement', 'date', 'created_at'])
    const statusCol = await pickColumn(pool, 'paiements', ['status', 'statut'])
    if (dateCol) {
      const statusFilter = statusCol ? `AND LOWER(p.${statusCol}::text) IN ('paye','payee')` : ''
      const { rows } = await pool.query<{ total: number }>(`
        SELECT COALESCE(SUM(p.montant), 0) AS total
          FROM public.paiements p
         WHERE p.tenant_id = $1
           AND p.${dateCol}::date BETWEEN $2::date AND $3::date
           ${statusFilter}
      `, [tenantId, from, to])
      results.encaissements += Number(rows[0]?.total ?? 0)
    }
  } catch (e: any) {
    logger.warn('[reports] encaissements paiements indisponibles :', e?.message)
  }

  try {
    const { rows } = await pool.query<{ total: number }>(`
      SELECT COALESCE(SUM(r.montant), 0) AS total
        FROM public.revenus r
       WHERE r.tenant_id = $1 AND r.date_revenu BETWEEN $2::date AND $3::date
    `, [tenantId, from, to])
    results.encaissements += Number(rows[0]?.total ?? 0)
  } catch {
    /* Table absente (module financier non migré) — on ignore, le total
       reste celui des paiements. */
  }

  try {
    const { rows } = await pool.query<{ cl: string; pr: string; pj: string }>(`
      SELECT
        (SELECT COUNT(*) FROM public.clients c
          WHERE c.tenant_id = $1 AND c.created_at::date BETWEEN $2::date AND $3::date)::text AS cl,
        (SELECT COUNT(*) FROM public.prospects p
          WHERE p.tenant_id = $1 AND p.created_at::date BETWEEN $2::date AND $3::date)::text AS pr,
        (SELECT COUNT(*) FROM public.projets pj
          WHERE pj.tenant_id = $1 AND pj.statut = 'termine'
            AND COALESCE(pj.date_fin_reelle, pj.updated_at::date) BETWEEN $2::date AND $3::date)::text AS pj
    `, [tenantId, from, to])
    results.nouveaux_clients   = Number(rows[0]?.cl ?? 0)
    results.nouveaux_prospects = Number(rows[0]?.pr ?? 0)
    results.projets_termines   = Number(rows[0]?.pj ?? 0)
  } catch (e: any) {
    logger.warn('[reports] compteurs hebdo indisponibles :', e?.message)
  }

  return results
}

/** Prochaines actions : ce qui tombe dans les 7 jours à venir. */
async function collectNextActions(
  pool: Pool,
  tenantId: string,
  localDate: string,
  tasks: TasksSnapshot,
  contacts: ContactsSnapshot,
): Promise<PriorityRow[]> {
  const out: PriorityRow[] = []

  if (tasks.counts.overdue) {
    out.push({
      urgency: 'critical',
      label:   `Rattraper ${tasks.counts.overdue} tâche${tasks.counts.overdue > 1 ? 's' : ''} en retard`,
      detail:  tasks.overdue.slice(0, 3).map(t => `${t.title}${t.days_late ? ` (${t.days_late} j)` : ''}`).join(' · '),
    })
  }
  if (tasks.counts.today || tasks.counts.soon) {
    out.push({
      urgency: 'warning',
      label:   `${tasks.counts.today + tasks.counts.soon} tâche${tasks.counts.today + tasks.counts.soon > 1 ? 's' : ''} à livrer d'ici 7 jours`,
      detail:  [...tasks.today, ...tasks.soon].slice(0, 3).map(t => t.title).join(' · '),
    })
  }
  if (tasks.counts.validation) {
    out.push({
      urgency: 'warning',
      label:   `Valider ${tasks.counts.validation} tâche${tasks.counts.validation > 1 ? 's' : ''} terminée${tasks.counts.validation > 1 ? 's' : ''} par l'équipe`,
      detail:  null,
    })
  }
  if (contacts.counts.prospects_relance || contacts.counts.prospects_never) {
    const n = contacts.counts.prospects_relance + contacts.counts.prospects_never
    out.push({
      urgency: 'critical',
      label:   `Contacter ${n} prospect${n > 1 ? 's' : ''}`,
      detail:  `${contacts.counts.prospects_relance} relance(s) échue(s) · ${contacts.counts.prospects_never} jamais contacté(s)`,
    })
  }
  if (contacts.counts.clients_never || contacts.counts.clients_stale) {
    const n = contacts.counts.clients_never + contacts.counts.clients_stale
    out.push({
      urgency: 'info',
      label:   `Reprendre contact avec ${n} client${n > 1 ? 's' : ''}`,
      detail:  `${contacts.counts.clients_never} sans contact enregistré · ${contacts.counts.clients_stale} sans nouvelle depuis longtemps`,
    })
  }

  /* Échéances contractuelles de la semaine à venir — domaines et
     hébergements ont déjà leur propre rappel, on ne redonne ici que le
     compte pour que le plan de semaine soit complet. */
  try {
    const { rows } = await pool.query<{ nb: string }>(`
      SELECT (
        (SELECT COUNT(*) FROM public.domaines d
          WHERE d.tenant_id = $1 AND d.date_expiration BETWEEN $2::date AND $2::date + 7) +
        (SELECT COUNT(*) FROM public.hebergements h
          WHERE h.tenant_id = $1 AND h.date_expiration BETWEEN $2::date AND $2::date + 7)
      )::text AS nb
    `, [tenantId, localDate])
    const nb = Number(rows[0]?.nb ?? 0)
    if (nb > 0) {
      out.push({
        urgency: 'warning',
        label:   `${nb} renouvellement${nb > 1 ? 's' : ''} (domaine / hébergement) cette semaine`,
        detail:  null,
      })
    }
  } catch {
    /* module absent — sans conséquence sur le reste du rapport */
  }

  return out
}

/* ─────────────────────────────────────────────────────────────────────
   Utilitaires
───────────────────────────────────────────────────────────────────── */

/** Décale une date 'YYYY-MM-DD' de n jours, sans dépendre du fuseau du process. */
export function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} MAD`
}

export function fmtDateFr(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}
