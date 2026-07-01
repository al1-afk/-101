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
    }
    console.log(`[expiryScheduler] hébergements : ${hebergements.rowCount} rappel(s) envoyé(s)`)
  } catch (err: any) {
    console.error('[expiryScheduler] error:', err?.message)
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
