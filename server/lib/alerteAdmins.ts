/**
 * PRÉVENIR L'ADMINISTRATION — cloche + téléphone, en un seul geste.
 *
 * ── Pourquoi ce fichier ─────────────────────────────────────────────
 * Le dépôt savait déjà prévenir les administrateurs : `mySpace.ts`
 * écrivait une ligne de cloche pour chaque admin puis appelait
 * `sendPushToUser` dans la même boucle. Mais cette séquence n'existait
 * qu'à UN endroit — la création de tâche par un employé — et chaque
 * nouveau besoin (une tâche terminée, un paiement encaissé) demandait de
 * la recopier : la requête des admins, la ligne de cloche avec ses neuf
 * colonnes, le push, et les deux `catch` qui empêchent une notification
 * ratée de faire échouer l'action de l'utilisateur.
 *
 * Recopiée, cette séquence aurait divergé : un endroit oublie le push,
 * un autre oublie le contexte tenant et se fait refuser par la RLS —
 * c'est exactement ce qui était arrivé aux rapports automatiques, dont
 * les lignes de cloche n'ont jamais été écrites en production pendant
 * des semaines (cf. le commentaire de reportScheduler.pushInApp).
 *
 * ── Deux canaux, une intention ──────────────────────────────────────
 * La CLOCHE est l'historique : elle reste, elle se relit, elle se
 * marque comme lue. Le PUSH est l'interruption : il atteint la personne
 * application fermée, et c'est le seul canal qui réponde à « je veux
 * être prévenu comme pour les autres applications ».
 *
 * Le push n'est PAS une garantie : il n'arrive qu'aux appareils qui se
 * sont abonnés (Réglages → Notifications, et sur iPhone seulement après
 * ajout à l'écran d'accueil). Son échec est donc silencieux par
 * construction — mais la ligne de cloche, elle, est toujours écrite.
 */
import { tenantQuery } from '../db/pool'
import { logger } from './logger'
import { sendPushToUser } from './webPush'

export interface AlerteAdmin {
  /** Famille d'événement — sert au filtrage et au regroupement côté écran. */
  kind: string
  severity?: 'info' | 'success' | 'warning' | 'critical'
  titre: string
  message: string
  /** Route du front, SANS le préfixe d'espace (ex. « /taches ») : il est
   *  ajouté ici, car une notification ouverte depuis un téléphone part
   *  de la racine du site et n'a aucun espace en mémoire. */
  lien: string
  icone?: string
  /** Regroupe les notifications du téléphone : un même `tag` remplace la
   *  précédente au lieu d'empiler dix bannières identiques. */
  tag?: string
  data?: Record<string, unknown>
  /** Clé d'unicité (tenant, personne, clé) : une seule notification par
   *  journée ou par objet, même si l'événement se répète. */
  dedupeKey?: string
  /** Ne pas se prévenir soi-même d'une action qu'on vient de faire. */
  saufUserId?: string | null
}

/**
 * Écrit la cloche et pousse vers les téléphones de tous les comptes
 * d'administration actifs de l'espace.
 *
 * Ne lève jamais : une notification est un accessoire de l'action, pas
 * l'action. Un paiement enregistré ne doit pas échouer parce qu'un
 * abonnement push est périmé.
 */
export async function previenirAdmins(tenantId: string, a: AlerteAdmin): Promise<number> {
  try {
    /* ── Le lien doit porter l'espace ────────────────────────────────
       Les routes de l'application sont toutes préfixées par le slug
       (`/:tenantSlug/taches`) : « /taches » seul est compris comme
       l'espace nommé « taches », dont la résolution échoue. Une
       notification ouverte depuis l'écran verrouillé aurait donc mené à
       une page d'erreur — le pire moment pour en montrer une.
       Le planificateur des rapports fait déjà ce préfixage de son côté
       (reportScheduler.pushInApp) ; on l'applique ici pour les
       événements, en laissant passer une URL absolue telle quelle. */
    const espace = await tenantQuery<{ slug: string }>(
      tenantId, `SELECT slug FROM public.tenants WHERE id = $1`, [tenantId],
    )
    const slug = espace[0]?.slug ?? ''
    const lien = slug && a.lien.startsWith('/') && !a.lien.startsWith(`/${slug}/`)
      ? `/${slug}${a.lien}`
      : a.lien

    const admins = await tenantQuery<{ user_id: string }>(
      tenantId,
      `SELECT user_id FROM public.tenant_users
        WHERE tenant_id = $1 AND status = 'active'
          AND role IN ('admin', 'manager')
          AND user_id IS NOT NULL
          AND ($2::uuid IS NULL OR user_id <> $2::uuid)`,
      [tenantId, a.saufUserId ?? null],
    )

    let prevenus = 0
    for (const admin of admins) {
      /* Le contexte tenant est OBLIGATOIRE : `notifications` est en
         FORCE ROW LEVEL SECURITY, et une écriture avec le pool nu est
         refusée en production sans jamais l'être en développement. */
      try {
        await tenantQuery(
          tenantId,
          `INSERT INTO public.notifications
             (tenant_id, user_id, kind, severity, title, message, link, icon, data, dedupe_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
           ON CONFLICT (tenant_id, user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
           DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message,
                         severity = EXCLUDED.severity, data = EXCLUDED.data,
                         is_read = FALSE, read_at = NULL, created_at = NOW()`,
          [
            tenantId, admin.user_id, a.kind, a.severity ?? 'info',
            a.titre, a.message, lien, a.icone ?? '🔔',
            JSON.stringify(a.data ?? {}), a.dedupeKey ?? null,
          ],
        )
        prevenus++
      } catch (e: any) {
        logger.error(`[alerte:${a.kind}] cloche ${admin.user_id} —`, e?.message)
      }

      /* Le push est « au mieux » : aucun appareil abonné, un abonnement
         expiré côté Apple ou Google, et il n'y a rien à faire — la
         cloche reste. */
      void sendPushToUser(tenantId, admin.user_id, {
        title: `${a.icone ?? '🔔'} ${a.titre}`,
        body:  a.message,
        url:   lien,
        tag:   a.tag ?? a.kind,
      }).catch(() => {})
    }
    return prevenus
  } catch (e: any) {
    logger.error(`[alerte:${a.kind}]`, e?.message)
    return 0
  }
}
