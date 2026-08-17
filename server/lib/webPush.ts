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
 * ── Pourquoi une liste blanche d'hôtes ─────────────────────────────
 * L'`endpoint` d'un abonnement est une URL fournie par le CLIENT, et le
 * serveur va y émettre des requêtes HTTPS. Sans contrôle d'hôte, c'est
 * une SSRF authentifiée : n'importe quel compte pourrait enregistrer
 * `https://10.0.0.12:6443/` puis se servir des réponses distinctes de
 * /api/push/test (200 remis / 404+abonnement supprimé / 404+conservé)
 * comme d'un scanner du réseau interne, et poster un corps chiffré sur
 * le chemin de son choix.
 *
 * Vérifier « ce n'est pas une IP privée » ne suffit pas : le DNS peut
 * être re-résolu entre le contrôle et la connexion (DNS rebinding).
 * Seuls les hôtes des services de push réellement existants sont donc
 * acceptés — la liste est courte, stable, et ajustable par
 * PUSH_ALLOWED_HOSTS si un navigateur en introduit un nouveau.
 *
 * ── Abonnements morts ──────────────────────────────────────────────
 * Un navigateur désinstallé, un cache vidé, une PWA supprimée : le
 * service de push répond 404 ou 410. L'abonnement ne redeviendra jamais
 * valide — on le supprime immédiatement, sinon la table enfle et chaque
 * envoi traîne des destinataires fantômes.
 */
import webpush from 'web-push'
import { tenantQuery } from '../db/pool'
import { logger } from './logger'

/* Suffixes des services de push des navigateurs. Un endpoint doit
   terminer par l'un d'eux — comparaison sur le nom d'hôte complet, pas
   sur une sous-chaîne (« evil-fcm.googleapis.com.attaquant.net » ne
   passe pas). */
const DEFAULT_ALLOWED_HOSTS = [
  'fcm.googleapis.com',              // Chrome, Edge, Brave, Opera
  'android.googleapis.com',          // Chrome (ancien endpoint)
  'push.services.mozilla.com',       // Firefox
  'web.push.apple.com',              // Safari / PWA iOS et macOS
  'notify.windows.com',              // Edge (WNS)
]

function allowedHosts(): string[] {
  const extra = (process.env.PUSH_ALLOWED_HOSTS ?? '')
    .split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
  return [...DEFAULT_ALLOWED_HOSTS, ...extra]
}

/**
 * L'endpoint est-il celui d'un service de push légitime ?
 *
 * Exporté pour être testé : c'est le contrôle qui sépare « le serveur
 * parle aux services de push » de « le serveur parle où on lui dit ».
 */
export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  /* Un port explicite n'a aucune raison d'apparaître sur un service de
     push public — et c'est le vecteur du balayage de ports interne. */
  if (url.port && url.port !== '443') return false
  if (url.username || url.password) return false

  const host = url.hostname.toLowerCase()
  /* Littéral IP (v4 ou v6) : jamais un service de push, toujours une
     tentative d'atteindre une machine précise. */
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host === 'localhost') {
    return false
  }
  return allowedHosts().some(allowed => host === allowed || host.endsWith(`.${allowed}`))
}

/* Un compte ne garde qu'un nombre borné d'appareils. Sans plafond,
   /api/push/test devient un amplificateur : autant de requêtes sortantes
   que de lignes, et c'est l'appelant qui choisit ce nombre. */
export const MAX_DEVICES_PER_USER = 10

/* Un service de push injoignable ne doit pas immobiliser une connexion :
   sans délai maximal, un hôte filtrant retient la requête jusqu'au
   timeout TCP par défaut. */
const PUSH_TIMEOUT_MS = 8_000

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
  tenantId: string,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  if (!configured) return 0

  /* `push_subscriptions` est FORCE RLS : lue par le pool nu, elle
     renverrait zéro ligne en production (le compte applicatif n'est ni
     superuser ni BYPASSRLS). Le contexte tenant est donc obligatoire,
     y compris pour un envoi déclenché par un travail de fond. */
  const rows = await tenantQuery<StoredSubscription>(tenantId,
    `SELECT id, endpoint, p256dh, auth
       FROM public.push_subscriptions
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY last_seen_at DESC
      LIMIT ${MAX_DEVICES_PER_USER}`,
    [tenantId, userId]
  )
  if (!rows.length) return 0

  const body = JSON.stringify(payload)
  let delivered = 0

  /* Séquentiel : une personne a une poignée d'appareils, et un envoi en
     rafale non borné transformerait un seul appel en pic de connexions
     sortantes. */
  for (const sub of rows) {
    /* Deuxième contrôle, à l'ENVOI : une ligne a pu être écrite avant
       l'ajout de la liste blanche, ou par un autre chemin. */
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      logger.error('[push] endpoint hors liste blanche, abonnement supprimé')
      await tenantQuery(tenantId,
        `DELETE FROM public.push_subscriptions WHERE id = $1`, [sub.id]).catch(() => {})
      continue
    }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 3600, timeout: PUSH_TIMEOUT_MS },   // au-delà d'une heure, un rappel n'a plus d'objet
      )
      delivered++
      await tenantQuery(tenantId,
        `UPDATE public.push_subscriptions SET last_seen_at = NOW() WHERE id = $1`,
        [sub.id]
      ).catch(() => {})
    } catch (e: any) {
      const status = e?.statusCode
      if (status === 404 || status === 410) {
        /* Abonnement définitivement mort — on le retire tout de suite. */
        await tenantQuery(tenantId,
          `DELETE FROM public.push_subscriptions WHERE id = $1`, [sub.id])
          .catch(() => {})
      } else {
        logger.error('[push] envoi échoué :', status ?? '', e?.message ?? e)
      }
    }
  }

  return delivered
}
