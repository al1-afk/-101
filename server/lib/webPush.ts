/**
 * Web Push — notifications hors application (navigateur fermé).
 *
 * Le protocole tient en trois pièces :
 *   1. une paire de clés VAPID, qui identifie CE serveur auprès des
 *      services de push (FCM pour Chrome, autopush pour Firefox…) ;
 *   2. un abonnement par navigateur (endpoint + deux clés), stocké en
 *      base — cf. migration 088 ;
 *   3. un message chiffré POUR cet abonnement : le service de push le
 *      relaie sans jamais pouvoir le lire.
 *
 * ── Sans clés VAPID, le module se tait ─────────────────────────────
 * `isPushConfigured()` renvoie false et les envois sont ignorés en
 * silence. C'est volontaire : une instance de développement sans clés
 * doit continuer à fonctionner (email + cloche), pas planter au boot.
 *
 * ── Abonnements morts ──────────────────────────────────────────────
 * Un navigateur désinstallé, un cache vidé, une PWA supprimée : le
 * service de push répond 404 ou 410. L'abonnement ne redeviendra jamais
 * valide — on le supprime immédiatement, sinon la table enfle et chaque
 * envoi traîne des destinataires fantômes.
 */
import webpush from 'web-push'
import type { Pool } from 'pg'
import { logger } from './logger'

let configured = false

export function isPushConfigured(): boolean {
  return configured
}

/** Clé publique à transmettre au navigateur pour qu'il s'abonne. */
export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? ''
}

export function initWebPush(): void {
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    logger.info('[push] VAPID absent — notifications navigateur désactivées')
    return
  }
  /* `subject` doit être une URL ou un mailto : c'est le contact que les
     services de push utilisent en cas d'abus. */
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:contact@nextgital.tech'
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    configured = true
    logger.info('[push] Web Push actif')
  } catch (e: any) {
    logger.error('[push] clés VAPID invalides :', e?.message ?? e)
  }
}

export interface PushPayload {
  title: string
  body:  string
  /** Chemin ouvert au clic sur la notification. */
  url?:  string
  /** Regroupe les notifications : une même `tag` remplace la précédente. */
  tag?:  string
  icon?: string
}

export interface StoredSubscription {
  id:       string
  endpoint: string
  p256dh:   string
  auth:     string
}

/**
 * Envoie à TOUS les navigateurs d'une personne et renvoie le nombre de
 * remises acceptées. Un appareil injoignable n'empêche pas les autres :
 * chaque envoi est isolé.
 */
export async function sendPushToUser(
  pool: Pool,
  tenantId: string,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  if (!configured) return 0

  const { rows } = await pool.query<StoredSubscription>(
    `SELECT id, endpoint, p256dh, auth
       FROM public.push_subscriptions
      WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId]
  )
  if (!rows.length) return 0

  const body = JSON.stringify(payload)
  let delivered = 0

  await Promise.all(rows.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 3600 },   // au-delà d'une heure, un rappel n'a plus d'objet
      )
      delivered++
      await pool.query(
        `UPDATE public.push_subscriptions SET last_seen_at = NOW() WHERE id = $1`,
        [sub.id]
      ).catch(() => {})
    } catch (e: any) {
      const status = e?.statusCode
      if (status === 404 || status === 410) {
        /* Abonnement définitivement mort — on le retire tout de suite. */
        await pool.query(`DELETE FROM public.push_subscriptions WHERE id = $1`, [sub.id])
          .catch(() => {})
      } else {
        logger.error('[push] envoi échoué :', status ?? '', e?.message ?? e)
      }
    }
  }))

  return delivered
}
