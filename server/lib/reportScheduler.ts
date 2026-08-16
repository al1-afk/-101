/**
 * NOTIFICATIONS & RAPPORTS AUTOMATIQUES — orchestrateur.
 *
 *   Toutes les 10 minutes :
 *     POUR CHAQUE espace dont les notifications sont activées
 *       → calcule l'heure LOCALE de l'espace (fuseau configuré)
 *       → pour chacun des 4 envois, si l'heure prévue est atteinte
 *         et que l'envoi du jour n'a pas encore eu lieu :
 *            1. réserve le créneau (INSERT dans notification_runs)
 *            2. collecte les données
 *            3. envoie l'email + dépose la notification in-app
 *            4. clôture la ligne de run (compteurs, statut)
 *
 * ── Pourquoi un tick à 10 minutes et pas un cron à l'heure pile ──────
 * Un `setInterval` d'une heure aligné sur le démarrage du process ne
 * tombe jamais à l'heure voulue après un redéploiement. Le tick court +
 * la règle « heure locale ATTEINTE » garantit l'envoi même si le serveur
 * redémarre à 8 h 05 pour un rapport prévu à 8 h 00.
 *
 * ── Pourquoi ça ne peut pas envoyer deux fois ───────────────────────
 * L'index unique (tenant_id, kind, run_date) WHERE trigger='auto' fait
 * office de verrou : le premier INSERT gagne, les suivants ne renvoient
 * aucune ligne et l'envoi est abandonné. Vrai entre deux ticks, entre
 * deux instances du serveur, et de part et d'autre d'un redémarrage.
 */
import type { Pool } from 'pg'
import { sendEmail } from './email'
import { logger } from './logger'
import {
  buildDailySnapshot, buildWeeklySnapshot, collectTasks, collectContacts,
} from './reportData'
import {
  renderTasksAlert, renderContactsAlert, renderDailyReport, renderWeeklyReport,
  type ReportKind, type RenderedReport, type RenderContext,
} from './reportEmails'

export const REPORT_KINDS: ReportKind[] = [
  'tasks_overdue', 'clients_to_contact', 'daily_report', 'weekly_report',
]

export const KIND_LABELS: Record<ReportKind, string> = {
  tasks_overdue:      'Alerte tâches en retard',
  clients_to_contact: 'Alerte clients à contacter',
  daily_report:       'Rapport quotidien',
  weekly_report:      'Rapport hebdomadaire',
}

export interface NotificationSettings {
  tenant_id: string
  enabled:   boolean
  timezone:  string
  recipients: string[]
  email_enabled: boolean
  inapp_enabled: boolean
  tasks_alert_enabled: boolean
  tasks_alert_hour:    number
  tasks_stale_days:    number
  contacts_alert_enabled: boolean
  contacts_alert_hour:    number
  contact_delay_days:     number
  new_lead_grace_days:    number
  daily_report_enabled: boolean
  daily_report_hour:    number
  weekly_report_enabled: boolean
  weekly_report_hour:    number
  weekly_report_weekday: number
}

export interface TenantTick extends NotificationSettings {
  tenant_name: string
  tenant_slug: string
  local_date:  string
  local_hour:  number
  local_dow:   number
}

/* ─────────────────────────────────────────────────────────────────────
   Tick principal
───────────────────────────────────────────────────────────────────── */
export async function tickReports(pool: Pool): Promise<void> {
  await unstickAbandonedRuns(pool)

  /* L'heure locale est calculée par PostgreSQL : le serveur applicatif
     tourne en UTC en production, et convertir soi-même reviendrait à
     réimplémenter la base de fuseaux (heure d'été comprise). */
  const { rows } = await pool.query<TenantTick>(`
    SELECT s.*,
           t.name AS tenant_name,
           t.slug AS tenant_slug,
           to_char(NOW() AT TIME ZONE s.timezone, 'YYYY-MM-DD')  AS local_date,
           EXTRACT(hour   FROM NOW() AT TIME ZONE s.timezone)::int AS local_hour,
           EXTRACT(isodow FROM NOW() AT TIME ZONE s.timezone)::int AS local_dow
      FROM public.notification_settings s
      JOIN public.tenants t ON t.id = s.tenant_id
     WHERE s.enabled = TRUE
       AND t.is_active = TRUE
  `)

  for (const tenant of rows) {
    for (const kind of REPORT_KINDS) {
      if (!isDue(tenant, kind)) continue
      try {
        await runKind(pool, tenant, kind, 'auto')
      } catch (e: any) {
        logger.error(`[reports] ${tenant.tenant_slug}/${kind} :`, e?.message ?? e)
      }
    }
  }
}

/** L'envoi est-il attendu maintenant, dans le fuseau de l'espace ? */
function isDue(t: TenantTick, kind: ReportKind): boolean {
  switch (kind) {
    case 'tasks_overdue':
      return t.tasks_alert_enabled && t.local_hour >= t.tasks_alert_hour
    case 'clients_to_contact':
      return t.contacts_alert_enabled && t.local_hour >= t.contacts_alert_hour
    case 'daily_report':
      return t.daily_report_enabled && t.local_hour >= t.daily_report_hour
    case 'weekly_report':
      /* Uniquement le jour choisi : un bilan hebdo envoyé le mardi parce
         que le serveur était arrêté lundi n'aiderait personne. */
      return t.weekly_report_enabled
          && t.local_dow === t.weekly_report_weekday
          && t.local_hour >= t.weekly_report_hour
  }
}

function scheduledHour(t: TenantTick, kind: ReportKind): number {
  switch (kind) {
    case 'tasks_overdue':      return t.tasks_alert_hour
    case 'clients_to_contact': return t.contacts_alert_hour
    case 'daily_report':       return t.daily_report_hour
    case 'weekly_report':      return t.weekly_report_hour
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Exécution d'un envoi
───────────────────────────────────────────────────────────────────── */
export async function runKind(
  pool: Pool,
  tenant: TenantTick,
  kind: ReportKind,
  trigger: 'auto' | 'manual',
): Promise<{ runId: string | null; report: RenderedReport | null }> {
  const runId = await claimRun(pool, tenant, kind, trigger)
  /* Créneau déjà pris par un autre tick / une autre instance : on sort
     sans rien envoyer. C'est le cas NORMAL, pas une erreur. */
  if (!runId) return { runId: null, report: null }

  try {
    const report = await buildReport(pool, tenant, kind)

    /* Une alerte sans matière n'est pas envoyée — mais l'exécution est
       tout de même journalisée (statut « empty »), ce qui évite de
       refaire le calcul toutes les 10 minutes jusqu'à minuit. */
    if (report.empty) {
      await pool.query(`
        UPDATE public.notification_runs
           SET status = 'empty', finished_at = NOW(), summary = $2::jsonb
         WHERE id = $1`, [runId, JSON.stringify(report.summary)])
      logger.info(`[reports] ${tenant.tenant_slug}/${kind} : rien à signaler`)
      return { runId, report }
    }

    const { sent, failed, recipients, notified } = await dispatch(pool, tenant, kind, report)

    await pool.query(`
      UPDATE public.notification_runs
         SET status = 'ok', finished_at = NOW(),
             recipients = $2, emails_sent = $3, emails_failed = $4,
             summary = $5::jsonb
       WHERE id = $1
    `, [runId, recipients, sent, failed, JSON.stringify(report.summary)])

    logger.info(
      `[reports] ${tenant.tenant_slug}/${kind} — ${sent} email(s), ${notified} notification(s) in-app` +
      (failed ? `, ${failed} échec(s)` : ''))
    return { runId, report }
  } catch (e: any) {
    await pool.query(`
      UPDATE public.notification_runs
         SET status = 'error', finished_at = NOW(), error = $2
       WHERE id = $1`, [runId, String(e?.message ?? e).slice(0, 500)])
      .catch(() => { /* la trace principale est déjà loguée par l'appelant */ })
    throw e
  }
}

/**
 * Réserve le créneau du jour. Renvoie l'id du run, ou null si un envoi
 * automatique a déjà eu lieu (ou est en cours) pour ce jour.
 *
 * Le `DO UPDATE … WHERE status = 'error'` autorise une nouvelle tentative
 * après un échec (SMTP indisponible, coupure réseau) sans jamais ouvrir
 * la porte à un doublon : une ligne « ok » ou « empty » bloque la
 * journée, et le nombre de tentatives est plafonné.
 */
async function claimRun(
  pool: Pool,
  tenant: TenantTick,
  kind: ReportKind,
  trigger: 'auto' | 'manual',
): Promise<string | null> {
  if (trigger === 'manual') {
    const { rows } = await pool.query<{ id: string }>(`
      INSERT INTO public.notification_runs
        (tenant_id, kind, run_date, scheduled_hour, trigger, status)
      VALUES ($1, $2, $3::date, $4, 'manual', 'running')
      RETURNING id
    `, [tenant.tenant_id, kind, tenant.local_date, scheduledHour(tenant, kind)])
    return rows[0]?.id ?? null
  }

  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO public.notification_runs
      (tenant_id, kind, run_date, scheduled_hour, trigger, status)
    VALUES ($1, $2, $3::date, $4, 'auto', 'running')
    ON CONFLICT (tenant_id, kind, run_date) WHERE trigger = 'auto'
    DO UPDATE SET status = 'running',
                  attempt = public.notification_runs.attempt + 1,
                  started_at = NOW(), finished_at = NULL, error = NULL
      WHERE public.notification_runs.status = 'error'
        AND public.notification_runs.attempt < 3
    RETURNING id
  `, [tenant.tenant_id, kind, tenant.local_date, scheduledHour(tenant, kind)])
  return rows[0]?.id ?? null
}

/**
 * Un run resté « running » (process tué, redéploiement en plein envoi)
 * bloquerait le créneau pour toujours. Au-delà de 20 minutes on le
 * considère mort : il repasse en « error », donc re-tentable.
 */
async function unstickAbandonedRuns(pool: Pool): Promise<void> {
  const { rowCount } = await pool.query(`
    UPDATE public.notification_runs
       SET status = 'error', finished_at = NOW(),
           error = COALESCE(error, 'Interrompu (arrêt du serveur pendant l''envoi)')
     WHERE status = 'running'
       AND started_at < NOW() - INTERVAL '20 minutes'
  `)
  if (rowCount) logger.warn(`[reports] ${rowCount} exécution(s) interrompue(s) débloquée(s)`)
}

/* ─────────────────────────────────────────────────────────────────────
   Construction du contenu
───────────────────────────────────────────────────────────────────── */
export async function buildReport(
  pool: Pool,
  tenant: TenantTick,
  kind: ReportKind,
): Promise<RenderedReport> {
  const ctx: RenderContext = {
    tenantName: tenant.tenant_name,
    tenantSlug: tenant.tenant_slug,
    localDate:  tenant.local_date,
  }
  const opts = {
    timezone:         tenant.timezone,
    localDate:        tenant.local_date,
    staleDays:        tenant.tasks_stale_days,
    contactDelayDays: tenant.contact_delay_days,
    newLeadGraceDays: tenant.new_lead_grace_days,
  }

  switch (kind) {
    case 'tasks_overdue': {
      const snap = await collectTasks(pool, tenant.tenant_id, opts.localDate, opts.staleDays)
      return renderTasksAlert(snap, ctx)
    }
    case 'clients_to_contact': {
      const snap = await collectContacts(
        pool, tenant.tenant_id, opts.localDate, opts.contactDelayDays, opts.newLeadGraceDays)
      return renderContactsAlert(snap, ctx, opts.contactDelayDays)
    }
    case 'daily_report': {
      const snap = await buildDailySnapshot(pool, tenant.tenant_id, opts)
      return renderDailyReport(snap, ctx)
    }
    case 'weekly_report': {
      const snap = await buildWeeklySnapshot(pool, tenant.tenant_id, opts)
      return renderWeeklyReport(snap, ctx)
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Distribution : email + notification in-app
───────────────────────────────────────────────────────────────────── */
interface Admin { user_id: string; email: string | null }

async function loadAdmins(pool: Pool, tenantId: string): Promise<Admin[]> {
  const { rows } = await pool.query<Admin>(`
    SELECT tu.user_id, u.email
      FROM public.tenant_users tu
      JOIN public.users u ON u.id = tu.user_id
     WHERE tu.tenant_id = $1
       AND tu.role = 'admin'
       AND u.is_active IS NOT FALSE
  `, [tenantId])
  return rows
}

async function dispatch(
  pool: Pool,
  tenant: TenantTick,
  kind: ReportKind,
  report: RenderedReport,
): Promise<{ sent: number; failed: number; recipients: number; notified: number }> {
  const admins = await loadAdmins(pool, tenant.tenant_id)

  /* Destinataires email : la liste explicite si elle est renseignée,
     sinon tous les admins de l'espace. */
  const explicit = (tenant.recipients ?? []).map(e => e.trim()).filter(Boolean)
  const emails = explicit.length
    ? explicit
    : [...new Set(admins.map(a => a.email).filter((e): e is string => !!e))]

  let sent = 0
  let failed = 0

  if (tenant.email_enabled && emails.length) {
    const results = await Promise.allSettled(emails.map(to => sendEmail({
      to,
      subject: report.subject,
      html:    report.html,
      text:    report.text,
    })))
    for (const [i, r] of results.entries()) {
      if (r.status === 'fulfilled') { sent++ }
      else {
        failed++
        logger.error(`[reports] email → ${emails[i]} : ${r.reason?.message ?? r.reason}`)
      }
    }
  } else if (!emails.length) {
    logger.warn(`[reports] ${tenant.tenant_slug}/${kind} : aucun destinataire email`)
  }

  let notified = 0
  if (tenant.inapp_enabled && admins.length) {
    notified = await pushInApp(pool, tenant, kind, report, admins)
  }

  return { sent, failed, recipients: emails.length, notified }
}

/**
 * Dépose une notification par admin. La clé d'anti-doublon inclut le
 * jour local : un envoi manuel relancé trois fois dans la journée ne
 * remplit pas la cloche de trois lignes identiques — la ligne existante
 * est rafraîchie et repasse en non-lue.
 */
async function pushInApp(
  pool: Pool,
  tenant: TenantTick,
  kind: ReportKind,
  report: RenderedReport,
  admins: Admin[],
): Promise<number> {
  const dedupeKey = `${kind}:${tenant.local_date}`
  /* Lien absolu côté front : /:tenantSlug + la route visée. */
  const link = `/${tenant.tenant_slug}${report.inapp.link}`
  let n = 0
  for (const a of admins) {
    try {
      await pool.query(`
        INSERT INTO public.notifications
          (tenant_id, user_id, kind, severity, title, message, link, icon, data, dedupe_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
        ON CONFLICT (tenant_id, user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
        DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message,
                      severity = EXCLUDED.severity, data = EXCLUDED.data,
                      is_read = FALSE, read_at = NULL, created_at = NOW()
      `, [
        tenant.tenant_id, a.user_id, kind, report.inapp.severity,
        report.inapp.title, report.inapp.message, link, report.inapp.icon,
        JSON.stringify(report.summary), dedupeKey,
      ])
      n++
    } catch (e: any) {
      logger.error(`[reports] notification in-app (${a.user_id}) : ${e?.message}`)
    }
  }
  return n
}

/* ─────────────────────────────────────────────────────────────────────
   Déclenchement manuel (bouton « Envoyer maintenant »)
───────────────────────────────────────────────────────────────────── */
export async function loadTenantTick(pool: Pool, tenantId: string): Promise<TenantTick | null> {
  const { rows } = await pool.query<TenantTick>(`
    SELECT s.*,
           t.name AS tenant_name,
           t.slug AS tenant_slug,
           to_char(NOW() AT TIME ZONE s.timezone, 'YYYY-MM-DD')  AS local_date,
           EXTRACT(hour   FROM NOW() AT TIME ZONE s.timezone)::int AS local_hour,
           EXTRACT(isodow FROM NOW() AT TIME ZONE s.timezone)::int AS local_dow
      FROM public.notification_settings s
      JOIN public.tenants t ON t.id = s.tenant_id
     WHERE s.tenant_id = $1
  `, [tenantId])
  return rows[0] ?? null
}

/** Lance un envoi immédiatement, hors planning (et hors verrou du jour). */
export async function runReportNow(
  pool: Pool,
  tenantId: string,
  kind: ReportKind,
): Promise<{ ok: boolean; empty: boolean; subject?: string }> {
  const tenant = await loadTenantTick(pool, tenantId)
  if (!tenant) throw new Error('Notifications non configurées pour cet espace')
  const { report } = await runKind(pool, tenant, kind, 'manual')
  return { ok: true, empty: !!report?.empty, subject: report?.subject }
}

/** Génère le contenu sans rien envoyer ni journaliser (aperçu UI). */
export async function previewReport(
  pool: Pool,
  tenantId: string,
  kind: ReportKind,
): Promise<RenderedReport> {
  const tenant = await loadTenantTick(pool, tenantId)
  if (!tenant) throw new Error('Notifications non configurées pour cet espace')
  return buildReport(pool, tenant, kind)
}

/* ─────────────────────────────────────────────────────────────────────
   Démarrage
───────────────────────────────────────────────────────────────────── */
export function startReportScheduler(pool: Pool): void {
  if ((process.env.REPORTS_ENABLED ?? 'true').toLowerCase() === 'false') {
    logger.info('[reports] scheduler désactivé (REPORTS_ENABLED=false)')
    return
  }
  const intervalMs = Number(process.env.REPORTS_TICK_MS) || 10 * 60_000

  /* Toute erreur d'un tick est absorbée : un incident passager (table
     absente le temps d'une migration, base momentanément injoignable)
     ne doit pas provoquer d'unhandledRejection et emporter l'API. */
  const safeTick = () => tickReports(pool).catch(err => {
    logger.error('[reports] tick échoué (ignoré) :', err?.message ?? err)
  })

  /* Premier passage 2 min après le démarrage : laisse la base, les
     migrations et le transport SMTP se stabiliser. */
  setTimeout(safeTick, 120_000)
  setInterval(safeTick, intervalMs)
  logger.info(`[reports] scheduler démarré (1er passage dans 2 min, puis toutes les ${Math.round(intervalMs / 60_000)} min)`)
}
