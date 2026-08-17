/**
 * Rappels de tâches — « préviens-moi 5 min / 30 min / 1 jour avant ».
 *
 * Le module 086 signale les tâches DÉJÀ en retard. Celui-ci intervient
 * avant l'échéance, au seul moment où l'information sert encore à
 * quelque chose.
 *
 * ── Trois canaux, un seul déclencheur ──────────────────────────────
 * Un rappel qui part est déposé dans la cloche, envoyé par email et
 * poussé vers les navigateurs abonnés (Chrome, PWA installée sur Mac —
 * même application fermée). Chaque canal est coupable séparément dans
 * les préférences ; l'absence d'un canal n'empêche jamais les autres.
 *
 * ── Pourquoi la décision est en JavaScript et non en SQL ───────────
 * La requête ne fait que ramener les tâches datées des prochaines
 * semaines — un volume trivial. Le choix « ce rappel doit-il partir
 * maintenant ? » vit dans `pendingOffsets()`, fonction pure testée à
 * part (`npm run test:time`). Écrit en SQL, il aurait été impossible à
 * vérifier sans base.
 *
 * ── Pourquoi une boucle PAR ESPACE et non une seule requête ────────
 * Les tables portent `FORCE ROW LEVEL SECURITY` et leur politique est
 * `tenant_id = current_tenant_id()`. Une requête passée par le pool
 * NU ne pose jamais ce réglage : `current_tenant_id()` vaut NULL, la
 * comparaison vaut NULL, et la requête ne ramène RIEN — silencieusement.
 * En développement le piège est invisible, parce que le compte local est
 * SUPERUSER et échappe à la RLS ; en production (`gestiq_api`, ni
 * superuser ni BYPASSRLS) le planificateur n'aurait jamais rien envoyé.
 *
 * On énumère donc les espaces actifs (table `tenants`, non FORCÉE), puis
 * on interroge chacun via `tenantQuery`, qui pose le réglage et bascule
 * sur le rôle soumis à la RLS. Le cloisonnement reste vrai même pour un
 * travail de fond, et le nombre d'espaces se compte en dizaines.
 *
 * ── Pourquoi ça ne peut pas notifier deux fois ─────────────────────
 * `task_reminders_sent` a pour clé (tâche, offset, échéance visée).
 * L'INSERT ... ON CONFLICT DO NOTHING RETURNING sert de verrou : la
 * première exécution gagne, les suivantes n'obtiennent aucune ligne et
 * s'arrêtent là. Vrai entre deux ticks, entre deux instances, et de
 * part et d'autre d'un redémarrage. Et comme la clé porte l'échéance,
 * repousser une tâche réarme naturellement ses rappels.
 */
import type { Pool } from 'pg'
import { tenantQuery } from '../db/pool'
import { sendEmail } from './email'
import { logger } from './logger'
import { sendPushToUser, isPushConfigured } from './webPush'

/* Un tick par minute : c'est la granularité minimale pour qu'un rappel
   « 5 minutes avant » veuille dire quelque chose. */
const TICK_MS = 60_000

/**
 * Retard maximal toléré pour rattraper un rappel manqué (serveur
 * redémarré, base injoignable). Au-delà, le rappel est abandonné :
 * recevoir « dans 30 minutes » trois heures après coup désinforme.
 */
const CATCH_UP_MIN = 120

/* Les tâches examinées à chaque passage : de la veille (pour ne rien
   perdre au changement de fuseau) au mois suivant — l'offset maximum
   autorisé par la migration 088 étant de 30 jours. */
const HORIZON_DAYS = 32

export interface ReminderCandidate {
  task_id:      string
  tenant_id:    string
  tenant_slug:  string
  user_id:      string
  email:        string
  user_name:    string | null
  title:        string
  priority:     string | null
  project_id:   string | null
  project_name: string | null
  timezone:     string
  /** Échéance résolue en instant réel (date + heure, dans le fuseau de l'espace). */
  due_at:        Date
  /** Offsets retenus : ceux de la tâche, sinon ceux de la personne. */
  offsets:       number[]
  email_enabled: boolean
  push_enabled:  boolean
  inapp_enabled: boolean
}

/**
 * Quels rappels de cette tâche doivent partir maintenant ?
 *
 * Fonction pure — le cœur de la décision, testé isolément.
 *
 * Trois refus, dans cet ordre :
 *   · l'heure d'envoi n'est pas encore venue ;
 *   · l'échéance est déjà passée — un rappel « avant » n'a plus d'objet,
 *     le retard est le sujet d'un autre module ;
 *   · l'heure d'envoi est trop ancienne (> CATCH_UP_MIN).
 */
export function pendingOffsets(
  dueAt: Date,
  offsets: number[] | null | undefined,
  now: Date,
  catchUpMin: number = CATCH_UP_MIN,
): number[] {
  if (!offsets?.length) return []

  const due = dueAt.getTime()
  const t   = now.getTime()
  if (t >= due) return []

  const out: number[] = []
  /* Dédoublonnage : deux fois « 30 min » dans la liste ne doit pas
     produire deux notifications. */
  for (const off of [...new Set(offsets)].sort((a, b) => b - a)) {
    if (!Number.isFinite(off) || off < 0) continue
    const fireAt = due - off * 60_000
    if (t < fireAt) continue
    if (t - fireAt > catchUpMin * 60_000) continue
    out.push(off)
  }
  return out
}

/** « dans 5 minutes », « dans 30 minutes », « demain », « dans 3 jours ». */
export function offsetLabel(offsetMin: number): string {
  if (offsetMin <= 0)  return 'maintenant'
  if (offsetMin < 60)  return `dans ${offsetMin} minutes`
  if (offsetMin < 1440) {
    const h = Math.round(offsetMin / 60)
    return h === 1 ? 'dans 1 heure' : `dans ${h} heures`
  }
  const d = Math.round(offsetMin / 1440)
  return d === 1 ? 'demain' : `dans ${d} jours`
}

/**
 * Clé stable de l'échéance, telle qu'elle a été SAISIE.
 *
 * Volontairement construite sur `due_date` + `due_time` bruts, et non
 * sur l'instant calculé : l'instant dépend de l'heure par défaut de la
 * personne et du fuseau de l'espace, deux réglages modifiables. Passer
 * ses préférences de 09:00 à 10:00 renverrait sinon tous les rappels
 * déjà partis des tâches sans heure. Le « ~ » marque justement ce cas.
 */
export function buildDueKey(dueDate: string | Date, dueTime: string | null): string {
  const date = typeof dueDate === 'string' ? dueDate.slice(0, 10)
    : `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`
  return `${date}T${dueTime ? dueTime.slice(0, 5) : '~'}`
}

/** « 14:30 » dans le fuseau demandé — l'heure telle que la personne la lit. */
export function formatLocalTime(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone,
    }).format(d)
  } catch {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d)
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Tick
───────────────────────────────────────────────────────────────────── */

export async function tickTaskReminders(pool: Pool): Promise<number> {
  const now = new Date()

  /* `tenants` n'est pas FORCÉE : elle se lit sans contexte tenant.
     C'est le point d'entrée qui permet ensuite d'ouvrir un contexte
     propre à chaque espace. */
  const { rows: tenants } = await pool.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM public.tenants WHERE is_active = TRUE`
  )

  let sent = 0
  for (const tenant of tenants) {
    try {
      sent += await tickTenant(pool, tenant.id, tenant.slug, now)
    } catch (e: any) {
      /* Un espace en échec ne prive pas les autres de leurs rappels. */
      logger.error(`[task-reminders] espace ${tenant.slug} :`, e?.message ?? e)
    }
  }
  return sent
}

async function tickTenant(
  pool: Pool,
  tenantId: string,
  tenantSlug: string,
  now: Date,
): Promise<number> {
  /* L'échéance est une heure LOCALE (« mardi 14 h »), pas un instant
     UTC : `date + heure AT TIME ZONE fuseau` la convertit en instant
     réel, en laissant PostgreSQL gérer l'heure d'été. */
  const rows = await tenantQuery<any>(tenantId, `
    SELECT t.id                AS task_id,
           t.tenant_id,
           u.id                AS user_id,
           u.email,
           u.name              AS user_name,
           t.title,
           t.priority,
           t.project_id,
           t.due_date,
           t.due_time,
           pr.nom              AS project_name,
           COALESCE(ns.timezone, 'Africa/Casablanca') AS timezone,
           ((t.due_date + COALESCE(t.due_time, p.default_due_time, '09:00'::time))
              AT TIME ZONE COALESCE(ns.timezone, 'Africa/Casablanca')) AS due_at,
           COALESCE(t.reminder_offsets, p.default_offsets, '{30,1440}') AS offsets,
           COALESCE(p.email_enabled, TRUE) AS email_enabled,
           COALESCE(p.push_enabled,  TRUE) AS push_enabled,
           COALESCE(p.inapp_enabled, TRUE) AS inapp_enabled
      FROM public.team_member_tasks t
      /* Destinataire : la personne à qui la tâche est attribuée ; à
         défaut, celle qui l'a créée. Les tâches confiées à un membre
         d'équipe ou à un stagiaire sortent d'ici — ces comptes n'ont pas
         de ligne dans la table users et relèvent de /api/my-space. */
      JOIN public.users u ON u.id = COALESCE(t.assigned_user_id, t.created_by)
                         AND u.is_active = TRUE
      /* Appartenance VÉRIFIÉE : sans elle, une personne retirée de
         l'espace continuerait de recevoir par email le titre et le
         projet des tâches de ce tenant. */
      JOIN public.tenant_users tu ON tu.user_id = u.id AND tu.tenant_id = t.tenant_id
      LEFT JOIN public.projets pr ON pr.id = t.project_id
      LEFT JOIN public.notification_settings ns ON ns.tenant_id = t.tenant_id
      LEFT JOIN public.task_reminder_prefs p
             ON p.tenant_id = t.tenant_id
            AND p.user_id   = COALESCE(t.assigned_user_id, t.created_by)
     WHERE t.tenant_id = $1
       AND t.due_date IS NOT NULL
       /* « Annulée » est fermée au même titre que « terminée » —
          même règle que reportData.ts et les écrans de tâches. */
       AND t.status NOT IN ('done', 'cancelled')
       AND t.team_member_id IS NULL
       AND t.assigned_stagiaire_id IS NULL
       AND t.due_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + ${HORIZON_DAYS}
  `, [tenantId])

  let sent = 0
  for (const row of rows) {
    const dueAt = new Date(row.due_at)
    const offsets = Array.isArray(row.offsets) ? row.offsets.map(Number) : []
    const dueKey = buildDueKey(row.due_date, row.due_time)

    for (const offset of pendingOffsets(dueAt, offsets, now)) {
      try {
        /* Verrou : qui obtient la ligne envoie, les autres passent. */
        const lock = await tenantQuery(tenantId,
          `INSERT INTO public.task_reminders_sent
             (task_id, offset_min, due_key, due_at, tenant_id, user_id)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (task_id, offset_min, due_key) DO NOTHING
           RETURNING task_id`,
          [row.task_id, offset, dueKey, dueAt.toISOString(), tenantId, row.user_id]
        )
        if (!lock.length) continue

        const channels = await deliver(pool, { ...row, tenant_slug: tenantSlug }, dueAt, offset, dueKey)

        if (channels.length) {
          await tenantQuery(tenantId,
            `UPDATE public.task_reminders_sent SET channels = $1
              WHERE task_id = $2 AND offset_min = $3 AND due_key = $4`,
            [channels, row.task_id, offset, dueKey]
          ).catch(() => {})
          sent++
        } else {
          /* AUCUN canal n'a abouti : garder le verrou perdrait le rappel
             pour toujours. On le relâche pour que le passage suivant
             retente, tant que la fenêtre de rattrapage le permet. */
          await tenantQuery(tenantId,
            `DELETE FROM public.task_reminders_sent
              WHERE task_id = $1 AND offset_min = $2 AND due_key = $3`,
            [row.task_id, offset, dueKey]
          ).catch(() => {})
          logger.error(`[task-reminders] ${row.task_id}/${offset} : aucun canal, verrou relâché`)
        }
      } catch (e: any) {
        /* L'échec d'un rappel ne doit pas priver les suivants. Le verrou
           est relâché pour la même raison que ci-dessus. */
        logger.error(`[task-reminders] ${row.task_id}/${offset} :`, e?.message ?? e)
        await tenantQuery(tenantId,
          `DELETE FROM public.task_reminders_sent
            WHERE task_id = $1 AND offset_min = $2 AND due_key = $3 AND channels = '{}'`,
          [row.task_id, offset, dueKey]
        ).catch(() => {})
      }
    }
  }
  return sent
}

/** Dépose le rappel sur les canaux autorisés, renvoie ceux qui ont abouti. */
async function deliver(
  pool: Pool,
  row: any,
  dueAt: Date,
  offset: number,
  dueKey: string,
): Promise<string[]> {
  /* L'heure affichée est celle de l'espace : « échéance 14:30 » doit
     vouloir dire 14 h 30 à Oujda, pas en UTC. */
  const heure = formatLocalTime(dueAt, row.timezone ?? 'Africa/Casablanca')
  const quand = offsetLabel(offset)
  const projet = row.project_name ? ` · ${row.project_name}` : ''

  const title = `⏰ ${row.title}`
  const body  = `À faire ${quand} — échéance ${heure}${projet}`
  const link  = `/${row.tenant_slug}/taches`
  const channels: string[] = []

  /* 1. Cloche — le canal qui ne peut pas échouer, et celui qui garde
        une trace consultable même si l'email part en spam. */
  if (row.inapp_enabled) {
    try {
      /* `notifications` est FORCE RLS : sans contexte tenant, l'INSERT
         est refusé par la politique WITH CHECK. */
      await tenantQuery(row.tenant_id,
        `INSERT INTO public.notifications
           (tenant_id, user_id, kind, severity, title, message, link, icon, data, dedupe_key)
         VALUES ($1,$2,'task_reminder',$3,$4,$5,$6,'⏰',
                 jsonb_build_object('task_id', $7::text, 'offset_min', $8::int), $9)
         ON CONFLICT (tenant_id, user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
         DO NOTHING`,
        [
          row.tenant_id, row.user_id,
          row.priority === 'urgent' ? 'warning' : 'info',
          title, body, link, row.task_id, offset,
          /* Même clé stable que le verrou : la cloche ne doit pas se
             dédoubler quand une préférence d'heure change. */
          `task_reminder:${row.task_id}:${offset}:${dueKey}`,
        ]
      )
      channels.push('inapp')
    } catch (e: any) {
      logger.error('[task-reminders] cloche :', e?.message ?? e)
    }
  }

  /* 2. Navigateur — atteint la personne même application fermée. */
  if (row.push_enabled && isPushConfigured()) {
    try {
      const delivered = await sendPushToUser(row.tenant_id, row.user_id, {
        title, body, url: link,
        /* Une même tâche remplace son propre rappel plutôt que d'empiler
           « 1 jour avant » et « 30 min avant » à l'écran. */
        tag: `task-${row.task_id}`,
      })
      if (delivered) channels.push('push')
    } catch (e: any) {
      logger.error('[task-reminders] push :', e?.message ?? e)
    }
  }

  /* 3. Email — le filet, pour ce qui ne doit pas être manqué. */
  if (row.email_enabled && row.email) {
    try {
      await sendEmail({
        to: row.email,
        subject: `⏰ ${row.title} — ${quand}`,
        text: `${row.title}\n\nÀ faire ${quand} (échéance ${heure})${projet}\n\n`
            + `Ouvrir : ${publicUrl()}${link}`,
        html: reminderHtml({
          name: row.user_name, title: row.title, quand, heure,
          projet: row.project_name, url: `${publicUrl()}${link}`,
        }),
      })
      channels.push('email')
    } catch (e: any) {
      logger.error('[task-reminders] email :', e?.message ?? e)
    }
  }

  return channels
}

function publicUrl(): string {
  const raw = process.env.PUBLIC_APP_URL
    ?? process.env.CORS_ORIGINS?.split(',')[0]
    ?? ''
  return raw.trim().replace(/\/+$/, '')
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string
  ))
}

function reminderHtml(o: {
  name: string | null; title: string; quand: string; heure: string
  projet: string | null; url: string
}): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="height:4px;background:linear-gradient(90deg,#f59e0b,#ef4444)"></div>
    <div style="padding:24px">
      <p style="margin:0 0 4px;font-size:13px;color:#64748b">Rappel de tâche${o.name ? ` — ${esc(o.name)}` : ''}</p>
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${esc(o.title)}</h1>
      <p style="margin:0 0 16px;font-size:15px">
        À faire <strong>${esc(o.quand)}</strong> — échéance <strong>${esc(o.heure)}</strong>${
          o.projet ? `<br><span style="color:#64748b">Projet : ${esc(o.projet)}</span>` : ''
        }
      </p>
      <a href="${esc(o.url)}" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:14px">Ouvrir la tâche</a>
    </div>
  </div>
</body></html>`
}

/**
 * Purge des verrous d'envoi de plus de 90 jours.
 *
 * La table ne sert qu'à empêcher un doublon ; passé l'échéance de
 * plusieurs mois, une ligne n'empêche plus rien et n'apprend plus rien.
 * Sans cette purge, elle grossit d'une ligne par rappel et par tâche,
 * indéfiniment — l'index posé par la migration 088 existe pour elle.
 */
export async function purgeOldReminders(pool: Pool): Promise<number> {
  const { rows: tenants } = await pool.query<{ id: string }>(
    `SELECT id FROM public.tenants WHERE is_active = TRUE`
  )
  let purged = 0
  for (const t of tenants) {
    try {
      const rows = await tenantQuery<{ task_id: string }>(t.id,
        `DELETE FROM public.task_reminders_sent
          WHERE sent_at < NOW() - INTERVAL '90 days'
          RETURNING task_id`
      )
      purged += rows.length
    } catch (e: any) {
      logger.error('[task-reminders] purge :', e?.message ?? e)
    }
  }
  return purged
}

/* ─────────────────────────────────────────────────────────────────────
   Démarrage
───────────────────────────────────────────────────────────────────── */

export function startTaskReminderScheduler(pool: Pool): void {
  if ((process.env.TASK_REMINDERS_ENABLED ?? 'true').toLowerCase() === 'false') {
    logger.info('[task-reminders] désactivés (TASK_REMINDERS_ENABLED=false)')
    return
  }

  const safeTick = () => tickTaskReminders(pool)
    .then(n => { if (n) logger.info(`[task-reminders] ${n} rappel(s) envoyé(s)`) })
    .catch(err => logger.error('[task-reminders] tick échoué (ignoré) :', err?.message ?? err))

  /* Premier passage différé : au démarrage, la base peut être en cours
     de migration. */
  setTimeout(safeTick, 90_000)
  setInterval(safeTick, TICK_MS)

  /* Purge quotidienne — décalée de 10 min pour ne pas tomber en même
     temps que la vague de rappels du démarrage. */
  const purge = () => purgeOldReminders(pool)
    .then(n => { if (n) logger.info(`[task-reminders] ${n} verrou(x) purgé(s)`) })
    .catch(err => logger.error('[task-reminders] purge échouée (ignorée) :', err?.message ?? err))
  setTimeout(purge, 10 * 60_000)
  setInterval(purge, 24 * 3600_000)
  logger.info('[task-reminders] planificateur démarré (passage chaque minute)')
}
