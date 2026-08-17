/**
 * 7aty — rappel du soir : « as-tu saisi ta journée ? »
 *
 * Une notification, une seule par jour, dans la cloche — et seulement si
 * la journée n'est PAS déjà expliquée. C'est la règle qui fait la
 * différence entre un rappel utile et une notification de plus qu'on
 * finit par ignorer : le soir où tout est saisi, il ne se passe rien.
 *
 * ── Qui reçoit le rappel ────────────────────────────────────────────
 * Les personnes qui SE SERVENT du module, sans avoir rien à configurer :
 * celles qui ont enregistré au moins un bloc dans les 14 derniers jours.
 * Quelqu'un qui n'a jamais ouvert 7aty n'est jamais dérangé, et quelqu'un
 * qui cesse de s'en servir cesse d'être relancé au bout de deux semaines.
 * `time_settings.reminder_enabled = FALSE` coupe le rappel explicitement.
 *
 * ── Pourquoi une boucle PAR ESPACE ─────────────────────────────────
 * `time_entries`, `time_settings` et `notifications` portent FORCE ROW
 * LEVEL SECURITY, avec la politique `tenant_id = current_tenant_id()`.
 * Une requête passée par le pool NU ne pose jamais ce réglage : la
 * comparaison vaut NULL et la requête ne ramène RIEN — silencieusement.
 * En développement le compte local est SUPERUSER et masque le problème ;
 * en production (`gestiq_api`) le rappel ne serait jamais parti. On
 * énumère donc les espaces (table `tenants`, non FORCÉE) puis on
 * interroge chacun via `tenantQuery`, qui pose le réglage et bascule sur
 * le rôle soumis à la RLS.
 *
 * ── Pourquoi ça ne peut pas notifier deux fois ──────────────────────
 * `notifications.dedupe_key` = « 7aty_reminder:<date locale> », couvert
 * par un index unique (tenant_id, user_id, dedupe_key) posé par la
 * migration 086. L'INSERT ... ON CONFLICT DO NOTHING est donc le verrou :
 * vrai entre deux ticks, entre deux instances du serveur, et de part et
 * d'autre d'un redémarrage. Le tick court + la règle « heure locale
 * ATTEINTE » garantissent l'inverse aussi — un serveur redémarré à 22 h 05
 * envoie quand même le rappel de 22 h.
 *
 * Ce fichier est volontairement autonome : il n'importe rien du module
 * de notifications (server/lib/reportScheduler.ts) et se contente d'ÉCRIRE
 * dans la table `notifications`, qui est le contrat stable entre les deux.
 */
import type { Pool } from 'pg'
import { tenantQuery } from '../db/pool'
import { logger } from './logger'

/* Fuseau retenu quand l'espace n'a pas encore de configuration de
   notifications — même défaut que la migration 086. */
const FALLBACK_TZ = 'Africa/Casablanca'

/* Une personne n'est relancée que si elle s'est servie du module
   récemment. Deux semaines : assez large pour couvrir des vacances,
   assez court pour ne pas relancer quelqu'un qui a abandonné. */
const ACTIVE_WINDOW_DAYS = 14

/**
 * Part de la journée de travail qui doit être expliquée pour que le
 * rappel se taise. 70 % et non 100 % : personne ne chronomètre ses
 * pauses café, et exiger la journée entière ferait sonner le rappel tous
 * les soirs — c'est-à-dire plus jamais, une fois qu'on l'ignore.
 */
const COVERAGE_RATIO = 0.7

/** Un jour non travaillé est « expliqué » dès qu'une heure est saisie. */
const OFF_DAY_MIN = 60

export interface ReminderCandidate {
  tenant_id:   string
  user_id:     string
  local_date:  string
  local_hour:  number
  local_dow:   number      // 1 = lundi … 7 = dimanche
  timezone:    string
  reminder_hour:   number
  work_start_hour: number
  work_end_hour:   number
  work_days:       number[]
}

export interface ReminderDecision {
  send:        boolean
  reason:      'ok' | 'day_covered' | 'nothing_expected'
  trackedMin:  number
  expectedMin: number
  missingMin:  number
}

/**
 * Faut-il relancer cette personne, ce soir ?
 *
 * Fonction pure — c'est la seule règle métier du planificateur, et elle
 * est testée isolément (`npm run test:time`).
 */
export function decideReminder(
  candidate: Pick<ReminderCandidate, 'local_dow' | 'work_start_hour' | 'work_end_hour' | 'work_days'>,
  trackedMin: number,
): ReminderDecision {
  const isWorkDay = candidate.work_days.includes(candidate.local_dow)

  if (!isWorkDay) {
    /* Jour de repos : on ne réclame pas un journal complet, juste un
       minimum — sinon le module devient une corvée le dimanche. */
    const send = trackedMin < OFF_DAY_MIN
    return {
      send,
      reason: send ? 'ok' : 'day_covered',
      trackedMin,
      expectedMin: OFF_DAY_MIN,
      missingMin: Math.max(0, OFF_DAY_MIN - trackedMin),
    }
  }

  const workMin = Math.max(0, (candidate.work_end_hour - candidate.work_start_hour) * 60)
  if (workMin === 0) {
    return { send: false, reason: 'nothing_expected', trackedMin, expectedMin: 0, missingMin: 0 }
  }

  const expected = Math.round(workMin * COVERAGE_RATIO)
  const send = trackedMin < expected
  return {
    send,
    reason: send ? 'ok' : 'day_covered',
    trackedMin,
    expectedMin: workMin,
    missingMin: Math.max(0, workMin - trackedMin),
  }
}

/** « 3h 25min » — même format que l'écran, pour que le texte colle. */
export function formatMinutes(min: number): string {
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h && m) return `${h}h ${String(m).padStart(2, '0')}min`
  if (h)      return `${h}h`
  return `${m}min`
}

/** Le texte du rappel, construit à partir des chiffres réels du jour. */
export function buildReminderText(d: ReminderDecision): { title: string; message: string } {
  if (d.trackedMin <= 0) {
    return {
      title: '7aty — ta journée n\'est pas encore saisie',
      message: 'Aucun bloc enregistré aujourd\'hui. Deux minutes avant de dormir suffisent : '
             + 'où sont passées tes heures ?',
    }
  }
  return {
    title: '7aty — ta journée n\'est expliquée qu\'en partie',
    message: `Tu as saisi ${formatMinutes(d.trackedMin)} aujourd'hui. `
           + `Il reste ${formatMinutes(d.missingMin)} sans trace — complète-les avant de dormir, `
           + 'tant que tu t\'en souviens.',
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Tick
───────────────────────────────────────────────────────────────────── */

export async function tickTimeReminders(pool: Pool): Promise<number> {
  /* `tenants` n'est pas FORCÉE : c'est le seul point de départ lisible
     sans contexte tenant. */
  const { rows: tenants } = await pool.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM public.tenants WHERE is_active = TRUE`
  )

  let sent = 0
  for (const tenant of tenants) {
    try {
      sent += await tickTenant(tenant.id, tenant.slug)
    } catch (e: any) {
      logger.error(`[7aty] espace ${tenant.slug} :`, e?.message ?? e)
    }
  }
  return sent
}

async function tickTenant(tenantId: string, tenantSlug: string): Promise<number> {
  /* L'heure locale est calculée par PostgreSQL : le serveur tourne en UTC
     en production, et convertir soi-même reviendrait à réimplémenter la
     base de fuseaux (heure d'été comprise). */
  const rows = await tenantQuery<ReminderCandidate>(tenantId, `
    WITH actifs AS (
      SELECT DISTINCT tenant_id, user_id
        FROM time_entries
       WHERE tenant_id = $2
         AND started_at > NOW() - INTERVAL '${ACTIVE_WINDOW_DAYS} days'
    )
    SELECT a.tenant_id,
           a.user_id,
           COALESCE(ns.timezone, $1)               AS timezone,
           to_char(NOW() AT TIME ZONE COALESCE(ns.timezone, $1), 'YYYY-MM-DD')  AS local_date,
           EXTRACT(hour   FROM NOW() AT TIME ZONE COALESCE(ns.timezone, $1))::int AS local_hour,
           EXTRACT(isodow FROM NOW() AT TIME ZONE COALESCE(ns.timezone, $1))::int AS local_dow,
           COALESCE(s.reminder_hour,   22)         AS reminder_hour,
           COALESCE(s.work_start_hour,  9)         AS work_start_hour,
           COALESCE(s.work_end_hour,   18)         AS work_end_hour,
           COALESCE(s.work_days, '{1,2,3,4,5,6}')  AS work_days
      FROM actifs a
      /* Appartenance vérifiée : une personne retirée de l'espace ne doit
         plus être relancée sur ses données. */
      JOIN tenant_users tu ON tu.user_id = a.user_id AND tu.tenant_id = a.tenant_id
      LEFT JOIN time_settings s
             ON s.tenant_id = a.tenant_id AND s.user_id = a.user_id
      LEFT JOIN notification_settings ns
             ON ns.tenant_id = a.tenant_id
     WHERE COALESCE(s.reminder_enabled, TRUE) = TRUE
  `, [FALLBACK_TZ, tenantId])

  let sent = 0
  for (const c of rows) {
    /* « Heure ATTEINTE » et non « heure égale » : un serveur redémarré à
       22 h 05 doit quand même envoyer le rappel de 22 h. Le dédoublonnage
       par dedupe_key empêche l'envoi répété à chaque tick suivant. */
    if (c.local_hour < c.reminder_hour) continue

    try {
      const tracked = await trackedMinutesForDay(c)
      const decision = decideReminder(c, tracked)
      if (!decision.send) continue

      const { title, message } = buildReminderText(decision)
      const inserted = await tenantQuery<{ id: string }>(tenantId, `
        INSERT INTO notifications
          (tenant_id, user_id, kind, severity, title, message, link, icon, data, dedupe_key)
        VALUES ($1, $2, '7aty_reminder', 'info', $3, $4, $5, '⏳',
                jsonb_build_object('tracked_min', $6::int, 'missing_min', $7::int), $8)
        ON CONFLICT (tenant_id, user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
        DO NOTHING
        RETURNING id
      `, [
        c.tenant_id, c.user_id, title, message,
        `/${tenantSlug}/7aty`,
        Math.round(decision.trackedMin), Math.round(decision.missingMin),
        `7aty_reminder:${c.local_date}`,
      ])
      if (inserted.length) sent++
    } catch (e: any) {
      /* L'échec d'une personne ne doit pas priver les autres de leur
         rappel — on journalise et on continue. */
      logger.error(`[7aty] rappel ${tenantSlug}/${c.user_id} :`, e?.message ?? e)
    }
  }
  return sent
}

/**
 * Minutes saisies pour la journée locale de la personne.
 *
 * Un chronomètre encore en cours compte le temps déjà écoulé : sans lui,
 * quelqu'un qui a laissé tourner son bloc de travail toute la soirée
 * serait relancé alors qu'il est justement en train de mesurer.
 */
async function trackedMinutesForDay(c: ReminderCandidate): Promise<number> {
  const rows = await tenantQuery<{ tracked: string }>(c.tenant_id, `
    SELECT COALESCE(SUM(
             COALESCE(duration_min, EXTRACT(EPOCH FROM (NOW() - started_at)) / 60)
           ), 0) AS tracked
      FROM time_entries
     WHERE tenant_id = $1
       AND user_id   = $2
       AND (started_at AT TIME ZONE $3)::date = $4::date
  `, [c.tenant_id, c.user_id, c.timezone, c.local_date])
  return Number(rows[0]?.tracked ?? 0)
}

/* ─────────────────────────────────────────────────────────────────────
   Démarrage
───────────────────────────────────────────────────────────────────── */

export function startTimeReminderScheduler(pool: Pool): void {
  if ((process.env.SEVENATY_REMINDERS_ENABLED ?? 'true').toLowerCase() === 'false') {
    logger.info('[7aty] rappels désactivés (SEVENATY_REMINDERS_ENABLED=false)')
    return
  }
  const intervalMs = Number(process.env.SEVENATY_TICK_MS) || 10 * 60_000

  /* Toute erreur d'un tick est absorbée : un incident passager (table
     absente le temps d'une migration, base momentanément injoignable) ne
     doit pas provoquer d'unhandledRejection et emporter l'API. */
  const safeTick = () => tickTimeReminders(pool)
    .then(n => { if (n) logger.info(`[7aty] ${n} rappel(s) déposé(s)`) })
    .catch(err => logger.error('[7aty] tick échoué (ignoré) :', err?.message ?? err))

  /* Premier passage différé : au démarrage, la base peut encore être en
     cours de migration. */
  setTimeout(safeTick, 2 * 60_000)
  setInterval(safeTick, intervalMs)
  logger.info(`[7aty] rappels démarrés (1er passage dans 2 min, puis toutes les ${Math.round(intervalMs / 60_000)} min)`)
}
