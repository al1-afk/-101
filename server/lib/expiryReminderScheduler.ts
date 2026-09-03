/**
 * Scheduler de rappels d'expiration : domaines + hébergements.
 *
 * Tourne au démarrage du serveur, puis toutes les 24h.
 * Pour chaque domaine/hébergement dont la date d'expiration tombe sur
 * un seuil (30j / 14j / 7j / 1j / aujourd'hui / 1j après), envoie un
 * email aux admins du tenant correspondant.
 *
 * Les seuils sont fixes : seul l'item dont (date_expiration - today) ∈ {30,14,7,1,0,-1}
 * déclenche un email aujourd'hui. Pas de risque de doublon car le check
 * tourne quotidiennement et chaque seuil ne matche qu'1 jour.
 */
import { Pool } from 'pg'
import { notifyExpiryReminder } from './notificationEmails'
import { tenantQuery } from '../db/pool'
import { sendPushToUser } from './webPush'

const REMINDER_DAYS = [30, 14, 7, 1, 0, -1] as const

interface ExpiringRow {
  tenant_id:       string
  id:              string
  nom:             string
  client_nom:      string | null
  date_expiration: string
  prix_annuel:     number | null
  days:            number
}

export async function checkAndSendExpiryReminders(pool: Pool): Promise<void> {
  const seuils = REMINDER_DAYS.join(',')
  try {
    /* Domaines */
    const domaines = await pool.query<ExpiringRow>(`
      SELECT d.tenant_id, d.id,
             d.nom_domaine AS nom,
             c.nom AS client_nom,
             to_char(d.date_expiration, 'YYYY-MM-DD') AS date_expiration,
             d.prix_annuel,
             (d.date_expiration - CURRENT_DATE) AS days
        FROM public.domaines d
        LEFT JOIN public.clients c ON c.id = d.client_id
       WHERE (d.date_expiration - CURRENT_DATE) IN (${seuils})
    `)
    for (const r of domaines.rows) {
      await notifyExpiryReminder(r.tenant_id, 'domaine', r)
      await pushExpiryNotification('domaine', r)
    }
    console.log(`[expiryScheduler] domaines : ${domaines.rowCount} rappel(s) envoyé(s)`)

    /* Hébergements */
    const hebergements = await pool.query<ExpiringRow>(`
      SELECT h.tenant_id, h.id,
             COALESCE(h.fournisseur, '(sans nom)') AS nom,
             c.nom AS client_nom,
             to_char(h.date_expiration, 'YYYY-MM-DD') AS date_expiration,
             h.prix_annuel,
             (h.date_expiration - CURRENT_DATE) AS days
        FROM public.hebergements h
        LEFT JOIN public.clients c ON c.id = h.client_id
       WHERE (h.date_expiration - CURRENT_DATE) IN (${seuils})
    `)
    for (const r of hebergements.rows) {
      await notifyExpiryReminder(r.tenant_id, 'hebergement', r)
      await pushExpiryNotification('hebergement', r)
    }
    console.log(`[expiryScheduler] hébergements : ${hebergements.rowCount} rappel(s) envoyé(s)`)
  } catch (err: any) {
    console.error('[expiryScheduler] error:', err?.message)
  }
}

/**
 * Cloche interne + notification navigateur pour un rappel d'expiration.
 *
 * L'e-mail seul ne suffisait pas : il se perd dans une boîte, alors que
 * l'échéance d'un domaine est une date qu'on ne rattrape pas. Les deux
 * canaux partent du même seuil, donc jamais l'un sans l'autre.
 *
 * `dedupe_key` protège du doublon si le serveur redémarre plusieurs fois
 * dans la même journée : le check tourne 30 s après chaque démarrage.
 */
async function pushExpiryNotification(
  kind: 'domaine' | 'hebergement',
  r: ExpiringRow,
): Promise<void> {
  const icon    = kind === 'domaine' ? '🌐' : '🖥️'
  const label   = kind === 'domaine' ? 'Domaine' : 'Hébergement'
  const urgence = r.days <= 1 ? 'critical' : r.days <= 7 ? 'warning' : 'info'
  const quand   =
    r.days < 0  ? `a expiré il y a ${Math.abs(r.days)} jour(s)`
    : r.days === 0 ? "expire aujourd'hui"
    : r.days === 1 ? 'expire demain'
    : `expire dans ${r.days} jours`

  const title = `${icon} ${label} ${r.nom} ${quand}`
  const body  = [
    r.client_nom ? `Client : ${r.client_nom}` : null,
    `Expiration : ${r.date_expiration}`,
  ].filter(Boolean).join(' · ')
  const link  = kind === 'domaine' ? '/domaines' : '/hebergements'

  try {
    const admins = await tenantQuery<{ user_id: string }>(
      r.tenant_id,
      `SELECT user_id FROM public.tenant_users
        WHERE tenant_id = $1 AND status = 'active' AND role IN ('admin', 'manager')`,
      [r.tenant_id],
    )

    for (const a of admins) {
      await tenantQuery(
        r.tenant_id,
        `INSERT INTO public.notifications
           (tenant_id, user_id, kind, severity, title, message, link, icon, dedupe_key, data)
         VALUES ($1, $2, 'expiration', $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          r.tenant_id, a.user_id, urgence, title, body, link, icon,
          `expiry:${kind}:${r.id}:${r.days}`,
          JSON.stringify({ kind, item_id: r.id, days: r.days, date_expiration: r.date_expiration }),
        ],
      ).catch(e => console.error('[expiryScheduler] notif row:', e?.message))

      sendPushToUser(r.tenant_id, a.user_id, {
        title,
        body,
        url: link,
        tag: `expiry-${kind}-${r.id}`,
      }).catch(() => {})
    }
  } catch (e: any) {
    console.error('[expiryScheduler] notification interne:', e?.message)
  }
}

/** Lance le scheduler : check au démarrage (après 30s), puis toutes les 24h. */
export function startExpiryReminderScheduler(pool: Pool): void {
  const ONE_DAY = 24 * 60 * 60 * 1000
  /* Premier check 30s après le démarrage (laisse le temps à la DB d'être prête) */
  setTimeout(() => { void checkAndSendExpiryReminders(pool) }, 30_000)
  /* Puis toutes les 24h */
  setInterval(() => { void checkAndSendExpiryReminders(pool) }, ONE_DAY)
  console.log('[expiryScheduler] started (1er check dans 30s, puis toutes les 24h)')
}
