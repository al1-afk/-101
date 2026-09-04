/**
 * Messagerie interne — API unifiée admin ET membre d'équipe.
 *
 *   GET  /api/messages/contacts                     correspondants + présence + non-lus
 *   GET  /api/messages/unread                       compteur de la pastille
 *   POST /api/messages/conversations                ouvrir/créer un fil
 *   GET  /api/messages/conversations/:id            le fil (pagination arrière)
 *   POST /api/messages/conversations/:id/messages   envoyer
 *   POST /api/messages/conversations/:id/read       accusé de lecture
 *   POST /api/messages/conversations/:id/files      téléverser une pièce jointe
 *   GET  /api/messages/files/:fileId                télécharger
 *   GET  /api/messages/prefs   PUT /api/messages/prefs
 *   GET  /api/messages/stream                       flux SSE
 *
 * ── Une seule route pour deux publics ─────────────────────────────
 * Un administrateur et un employé s'écrivent : leurs deux espaces
 * (/:tenantSlug/* et /my-space/*) doivent aboutir aux MÊMES lignes.
 * Deux implémentations séparées auraient fatalement divergé sur les
 * accusés, les non-lus et les notifications — c'est exactement ce qui
 * était arrivé à la discussion projet avant qu'elle ne soit unifiée
 * (server/routes/projetChat.ts). L'identité commune est users.id : un
 * membre d'équipe en possède une, au même titre qu'un admin.
 *
 * ── La RLS connaît la PERSONNE, pas seulement l'espace ────────────
 * Les politiques de la migration 100 lisent `app.current_user_id`.
 * Toute requête sur dm_* doit donc passer l'acteur en 4e argument de
 * tenantQuery/tenantTransaction. Les enveloppes dmQuery/dmQueryOne/dmTx
 * ci-dessous le font systématiquement : une requête écrite par
 * distraction avec tenantQuery « nu » ne renverrait rien, et cela se
 * verrait immédiatement.
 *
 * ── Pièces jointes ────────────────────────────────────────────────
 * Même dispositif que la discussion projet : le corps brut de la
 * requête est écrit en flux sur le volume (UPLOAD_DIR), la base ne
 * garde que la fiche signalétique, et chaque téléchargement repasse par
 * le contrôle d'appartenance à la conversation.
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { PoolClient } from 'pg'
import { query, queryOne, tenantQuery, tenantQueryOne, tenantTransaction } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { logger } from '../lib/logger'
import { sendPushToUser } from '../lib/webPush'
import { notifyDirectMessage } from '../lib/notificationEmails'
import {
  subscribeUser, publishToUser, isUserConnected, streamCount,
  MAX_STREAMS_PER_USER,
} from '../lib/realtimeBus'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Racine de stockage — volume Docker en production. */
const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.NODE_ENV === 'production' ? '/app/uploads' : path.resolve(process.cwd(), 'uploads'))

/** Plafond par pièce jointe. Plus bas que la discussion projet : une
 *  messagerie sert à échanger un document, pas à héberger des vidéos. */
const MAX_UPLOAD_BYTES = Number(process.env.MESSAGES_MAX_UPLOAD_MB || 25) * 1024 * 1024

/* ── Types de pièces jointes : ce que l'on accepte de NOMMER ────────
   Le type MIME arrive dans un en-tête : c'est du texte fourni par
   l'expéditeur. Le stocker tel quel puis le renvoyer au téléchargement
   transforme la messagerie en hébergeur de code. Un « photo.svg »
   déclaré image/svg+xml et servi en `inline` s'exécute dans l'origine
   de l'application — le client en fait une URL blob:, et une URL blob:
   hérite de l'origine du document qui l'a créée. Le script y lit le
   jeton de session de la personne qui a cliqué.

   Deux verrous complémentaires :
     • à l'ENTRÉE, tout type absent de cette liste devient un flux
       binaire anonyme. Le fichier n'est pas refusé — il est désarmé,
       et reste téléchargeable sous son vrai nom ;
     • à la SORTIE, seuls les types de MIME_AFFICHABLES peuvent s'ouvrir
       dans le navigateur. Le SVG n'en fait pas partie et n'en fera
       jamais partie : c'est un document XML qui exécute du script. */
const MIME_AUTORISES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/heic',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
  'video/mp4', 'video/webm', 'video/quicktime',
])

/* Ce qui peut s'afficher DANS le navigateur sans rien pouvoir exécuter. */
const MIME_AFFICHABLES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
  'application/pdf',
])

const BINAIRE_ANONYME = 'application/octet-stream'

/* ── Le module n'est pas encore installé sur cette base ──────────────
   Les migrations de ce projet sont appliquées À LA MAIN en production :
   il existe donc une fenêtre où le code est déployé et les tables
   dm_* n'existent pas (code PostgreSQL 42P01).

   Le flux temps réel étant monté dans le gabarit de l'espace, une
   erreur 500 y tomberait sur CHAQUE page, pas seulement sur l'écran
   Messages. On dégrade donc les LECTURES en « rien à afficher », comme
   le fait déjà server/routes/notifications.ts.

   Les ÉCRITURES, elles, répondent explicitement : un message qu'on
   croit envoyé alors qu'il n'est nulle part serait bien pire qu'une
   erreur visible. */
function moduleAbsent(err: any): boolean {
  return err?.code === '42P01'
}

const ERREUR_MODULE_ABSENT = {
  error: "Messagerie non installée sur cette base — migration 100 à appliquer.",
}

/** Type retenu à l'enregistrement : celui déclaré s'il est connu et sûr,
 *  jamais la chaîne brute de l'expéditeur. */
function normaliserMime(brut: unknown): string {
  const mime = String(brut ?? '').split(';')[0].trim().toLowerCase()
  return MIME_AUTORISES.has(mime) ? mime : BINAIRE_ANONYME
}

/* ── Types de pièces jointes : liste blanche, jamais la déclaration ──
   Le type MIME arrive dans l'en-tête `content-type` de l'expéditeur :
   c'est une DÉCLARATION, rien n'oblige un « image/png » à contenir une
   image. Le danger n'est pas théorique : un fichier « photo.svg »
   contenant <script>, renvoyé plus tard avec son type d'origine et
   `Content-Disposition: inline`, s'exécute dans l'ORIGINE de
   l'application — le client transforme la réponse en
   `URL.createObjectURL(blob)`, et une URL blob: hérite de l'origine du
   document. Le script y lit alors le jeton de la personne qui a
   simplement cliqué sur la vignette.

   D'où la règle : on ne STOCKE que des types connus et inoffensifs ;
   tout le reste — image/svg+xml et text/html en tête — devient
   'application/octet-stream', c'est-à-dire un fichier que le navigateur
   enregistre au lieu de l'interpréter. Le fichier n'est jamais refusé :
   il arrive à destination, il ne s'exécute simplement plus. */
const ALLOWED_MIME = new Set([
  /* Images matricielles — aucun script possible dans le format. */
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
  'image/bmp', 'image/heic', 'image/heif',
  /* Documents */
  'application/pdf', 'text/plain', 'text/csv',
  'application/rtf',
  /* Bureautique */
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  /* Archives */
  'application/zip',
  /* Audio & vidéo courants (message vocal, capture d'écran filmée) */
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac',
  'video/mp4', 'video/webm', 'video/quicktime',
])

/* Appellations rencontrées dans la nature (vieux navigateurs, Windows) :
   on les ramène au type canonique plutôt que de dégrader inutilement un
   fichier parfaitement légitime. */
const MIME_ALIASES: Record<string, string> = {
  'image/jpg':                     'image/jpeg',
  'image/pjpeg':                   'image/jpeg',
  'image/x-png':                   'image/png',
  'application/x-zip-compressed':  'application/zip',
  'application/x-pdf':             'application/pdf',
  'audio/mp3':                     'audio/mpeg',
  'audio/x-wav':                   'audio/wav',
  'audio/wave':                    'audio/wav',
  'text/rtf':                      'application/rtf',
}

/* Les seuls types qu'on accepte d'AFFICHER dans l'onglet : des images
   matricielles et le PDF (visionneuse isolée du navigateur). Tout le
   reste part en téléchargement, même si le client demande ?inline=1. */
const INLINE_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp',
  'application/pdf',
])

/** Ramène un type déclaré à un type sûr. Appliqué DEUX fois — à l'envoi
 *  (ce qu'on stocke) et au téléchargement (ce qu'on sert) : les lignes
 *  écrites avant ce garde-fou portent encore n'importe quoi. */
function normalizeMime(raw: unknown): string {
  /* Les paramètres (« ; charset=utf-8 ») ne participent pas à la
     décision et servent surtout à masquer un type derrière un autre. */
  const base = String(raw ?? '').split(';')[0].trim().toLowerCase()
  const canon = MIME_ALIASES[base] ?? base
  return ALLOWED_MIME.has(canon) ? canon : 'application/octet-stream'
}

/** Longueur d'un message. Au-delà, c'est un document — donc un fichier. */
const MAX_BODY_CHARS = 4000

/** Aperçu dénormalisé sur la conversation : de quoi remplir une ligne
 *  de liste, jamais le message entier. */
const PREVIEW_CHARS = 120

const PRIORITIES = ['normal', 'important', 'urgent'] as const
type DmPriority = typeof PRIORITIES[number]

/* ════════════════════════════════════════════════════════════════════
   1. QUI PARLE
   ═══════════════════════════════════════════════════════════════════ */

interface Actor {
  tenantId:  string
  /** users.id — l'identité canonique de la messagerie, commune aux deux
   *  publics. C'est elle que lit la RLS via current_app_user_id(). */
  userId:    string
  name:      string
  email:     string
  avatarUrl: string | null
  kind:      'admin' | 'member'
}

/* ── Accès base : l'acteur est OBLIGATOIRE ─────────────────────────
   Les politiques dm_* exigent current_app_user_id(). Sans le 4e
   argument, un SELECT renvoie zéro ligne et un INSERT est refusé. Ces
   trois enveloppes suppriment la possibilité même de l'oubli : aucune
   requête de ce module ne touche dm_* autrement. */
const dmQuery = <T = any>(actor: Actor, sql: string, params?: any[]): Promise<T[]> =>
  tenantQuery<T>(actor.tenantId, sql, params, actor.userId)

const dmQueryOne = <T = any>(actor: Actor, sql: string, params?: any[]): Promise<T | null> =>
  tenantQueryOne<T>(actor.tenantId, sql, params, actor.userId)

const dmTx = <T>(actor: Actor, fn: (client: PoolClient) => Promise<T>): Promise<T> =>
  tenantTransaction<T>(actor.tenantId, fn, actor.userId)

/**
 * Même chose, mais AU NOM D'UNE AUTRE PERSONNE.
 *
 * Réservé au travail de notification qui suit l'envoi : décider si le
 * destinataire veut un push ou un e-mail suppose de lire SES
 * préférences, et dm_prefs n'est lisible que par son propriétaire.
 * On agit donc explicitement en son nom — pour ses réglages et son
 * compteur de non-lus, jamais pour le contenu de ses autres fils.
 */
const asUserQueryOne = <T = any>(
  tenantId: string, userId: string, sql: string, params?: any[],
): Promise<T | null> => tenantQueryOne<T>(tenantId, sql, params, userId)

/* ── Module pas encore installé sur cette base ─────────────────────
   Les migrations passent À LA MAIN en production : la 100 peut ne pas
   être appliquée alors que le code, lui, est déjà déployé. Sans ce
   garde-fou, chaque route de la messagerie répondait 500 — et comme le
   hook temps réel est monté dans AppLayout, TOUTES les pages de
   l'espace affichaient une erreur, pas seulement l'écran Messages.

   Modèle repris de server/routes/notifications.ts : la LECTURE se
   dégrade en silence (liste vide, compteur à zéro, réglages par
   défaut), l'ÉCRITURE répond une erreur explicite — un faux succès
   ferait croire à un message envoyé qui n'existe nulle part. */
const isMissingTable = (err: any): boolean => err?.code === '42P01'

const NOT_INSTALLED = 'Module de messagerie non installé sur cette base (migration 100).'

/** Erreur porteuse d'un statut HTTP — sert à sortir d'une transaction
 *  avec un 400 plutôt qu'un 500 générique. */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function resolveActor(req: Request): Promise<Actor | null> {
  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId
  if (!UUID_RE.test(tenantId) || !UUID_RE.test(userId)) return null

  if (req.user!.role === 'team_member') {
    const m = await tenantQueryOne<{
      prenom: string | null; nom: string | null; email: string | null
      avatar_url: string | null; account_status: string
    }>(
      tenantId,
      `SELECT prenom, nom, email, avatar_url, account_status
         FROM public.team_members
        WHERE user_id = $1 AND tenant_id = $2
        LIMIT 1`,
      [userId, tenantId],
    )
    /* Un compte suspendu ou archivé garde un jeton valide jusqu'à son
       expiration : c'est ici qu'on lui ferme la porte. */
    if (!m || m.account_status !== 'active') return null
    const email = (m.email ?? '').trim()
    return {
      tenantId, userId, kind: 'member',
      name: [m.prenom, m.nom].filter(Boolean).join(' ').trim() || email || 'Membre',
      email,
      avatarUrl: m.avatar_url,
    }
  }

  /* Côté admin/staff, requireAuth a déjà relu le rôle effectif en base
     et refusé (401) une appartenance révoquée : il ne reste qu'à
     récupérer l'état civil. */
  const u = await tenantQueryOne<{ name: string | null; email: string; avatar_url: string | null }>(
    tenantId,
    `SELECT name, email, avatar_url FROM public.users WHERE id = $1`,
    [userId],
  )
  if (!u) return null
  return {
    tenantId, userId, kind: 'admin',
    name: (u.name ?? '').trim() || u.email,
    email: u.email,
    avatarUrl: u.avatar_url,
  }
}

/** Middleware : résout l'acteur une fois pour toutes les routes. */
async function withActor(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await resolveActor(req)
    if (!actor) return res.status(403).json({ error: 'Compte inactif' })
    ;(req as any).actor = actor
    next()
  } catch (err: any) {
    logger.error('[messages:actor]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

const getActor = (req: Request): Actor => (req as any).actor

router.use(requireAuth)
router.use(withActor)

/* ════════════════════════════════════════════════════════════════════
   2. LES CORRESPONDANTS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Construit la requête « une personne de mon espace, vue depuis moi » :
 * état civil, présence, conversation existante, non-lus et aperçu.
 *
 * Une seule source SQL sert la liste complète (écran Messages) ET la
 * fiche d'un correspondant précis (ouverture d'un fil, en-tête de
 * conversation) : deux requêtes distinctes auraient fini par afficher
 * deux présences différentes pour la même personne.
 *
 * Paramètres attendus : $1 = moi, $2 = espace, $3 = le correspondant
 * (uniquement pour les variantes filtrées).
 *
 * Les comptes INACTIFS ne sont pas exclus au niveau de la CTE mais
 * marqués : un employé parti hier ne doit plus apparaître dans la liste
 * des destinataires possibles, alors que son nom doit continuer de
 * s'afficher en tête des conversations passées.
 */
function peersSql(where: string, orderBy = ''): string {
  return `
    WITH comptes AS (
      SELECT tu.user_id, 'admin'::text AS kind, tu.role AS role,
             (tu.status = 'active') AS active
        FROM public.tenant_users tu
       WHERE tu.tenant_id = $2::uuid AND tu.user_id IS NOT NULL
      UNION ALL
      SELECT tm.user_id, 'member'::text, tm.job_title,
             (tm.account_status = 'active')
        FROM public.team_members tm
       WHERE tm.tenant_id = $2::uuid AND tm.user_id IS NOT NULL
    ),
    /* Une même personne peut porter les deux casquettes (compte admin
       ET fiche employé). On n'en garde qu'une ligne : la casquette
       active d'abord, l'admin ensuite — c'est celle qui décrit son
       espace de travail réel. */
    peers AS (
      SELECT DISTINCT ON (user_id) user_id, kind, role, active
        FROM comptes
       WHERE user_id <> $1::uuid
       ORDER BY user_id, active DESC, (kind = 'admin') DESC
    )
    SELECT q.user_id,
           COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', tm.prenom, tm.nom)), ''),
                    NULLIF(BTRIM(u.name), ''),
                    u.email)                              AS name,
           u.email,
           COALESCE(tm.avatar_url, u.avatar_url)          AS avatar_url,
           q.kind,
           q.role,
           pr.last_seen_at,
           /* Présence dérivée du battement de cœur (migration 080) :
              2 min = en ligne, 15 min = inactif, au-delà = hors ligne.
              MAX() suffit — plusieurs onglets, une seule personne. */
           CASE
             WHEN pr.last_seen_at > NOW() - INTERVAL '2 minutes'  THEN 'online'
             WHEN pr.last_seen_at > NOW() - INTERVAL '15 minutes' THEN 'idle'
             ELSE 'offline'
           END                                            AS presence,
           c.id                                           AS conversation_id,
           c.last_message_at,
           c.last_message_preview,
           COALESCE(c.last_sender_id = $1::uuid, FALSE)   AS last_message_mine,
           COALESCE(un.n, 0)                              AS unread
      FROM peers q
      JOIN public.users u ON u.id = q.user_id
      LEFT JOIN LATERAL (
        SELECT t.prenom, t.nom, t.avatar_url
          FROM public.team_members t
         WHERE t.tenant_id = $2::uuid AND t.user_id = q.user_id
         ORDER BY (t.account_status = 'active') DESC, t.created_at DESC
         LIMIT 1
      ) tm ON TRUE
      LEFT JOIN LATERAL (
        SELECT MAX(p.last_seen_at) AS last_seen_at
          FROM public.user_presence p
         WHERE p.tenant_id = $2::uuid AND p.user_id = q.user_id
      ) pr ON TRUE
      /* L'ordre canonique de la paire (user_a < user_b) rend la
         jointure directe : aucune conversation en double possible. */
      LEFT JOIN public.dm_conversations c
             ON c.tenant_id = $2::uuid
            AND c.user_a = LEAST($1::uuid, q.user_id)
            AND c.user_b = GREATEST($1::uuid, q.user_id)
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS n
          FROM public.dm_messages m
         WHERE m.conversation_id = c.id
           AND m.recipient_id = $1::uuid
           AND m.read_at IS NULL
      ) un ON TRUE
      ${where}
      ${orderBy}`
}

const CONTACTS_SQL = peersSql(
  'WHERE q.active',
  /* Les fils vivants d'abord, le reste par ordre alphabétique. */
  'ORDER BY c.last_message_at DESC NULLS LAST, name ASC',
)
const PEER_SQL        = peersSql('WHERE q.user_id = $3::uuid')
const PEER_ACTIVE_SQL = peersSql('WHERE q.user_id = $3::uuid AND q.active')

/**
 * Le MÊME périmètre que `CONTACTS_SQL`, pour les requêtes qui ne passent
 * pas par peersSql (les compteurs de non-lus).
 *
 * Pourquoi c'est indispensable : la liste des correspondants exclut les
 * comptes désactivés, alors que le compteur comptait TOUS les messages
 * non lus. Un message reçu d'un collègue parti depuis laissait donc une
 * pastille rouge indélébile — son fil n'apparaît plus dans la liste,
 * donc on ne peut plus l'ouvrir, donc plus jamais le marquer lu. Les
 * deux périmètres doivent coïncider exactement, sans quoi l'application
 * annonce des messages qu'elle rend inatteignables.
 *
 * Dans peersSql, la casquette retenue est la plus « active »
 * (DISTINCT ON … ORDER BY active DESC) : une personne est donc dans le
 * périmètre dès qu'UNE de ses casquettes est active — ce que dit
 * exactement ce EXISTS.
 */
function activePeerSql(tenantParam: string, peerExpr: string): string {
  return `EXISTS (
              SELECT 1 FROM public.tenant_users tu
               WHERE tu.tenant_id = ${tenantParam} AND tu.user_id = ${peerExpr}
                 AND tu.status = 'active'
               UNION ALL
              SELECT 1 FROM public.team_members tm
               WHERE tm.tenant_id = ${tenantParam} AND tm.user_id = ${peerExpr}
                 AND tm.account_status = 'active')`
}

interface PeerRow {
  user_id: string; name: string; email: string; avatar_url: string | null
  kind: 'admin' | 'member'; role: string | null
  presence: string; last_seen_at: string | null
  conversation_id: string | null; unread: number
  last_message_at: string | null; last_message_preview: string | null
  last_message_mine: boolean
}

/**
 * Fiche d'un correspondant. `requireActive` distingue les deux usages :
 * on n'ouvre un fil qu'avec une personne encore en poste, mais on
 * affiche l'en-tête d'une conversation même si elle est partie.
 */
async function loadPeer(actor: Actor, peerId: string, requireActive: boolean): Promise<PeerRow | null> {
  const row = await dmQueryOne<PeerRow>(
    actor,
    requireActive ? PEER_ACTIVE_SQL : PEER_SQL,
    [actor.userId, actor.tenantId, peerId],
  )
  if (row || requireActive) return row

  /* Dernier recours : la personne n'a plus ni ligne tenant_users ni
     fiche employé (compte supprimé de l'espace). L'historique doit
     rester lisible, avec un nom plutôt qu'un identifiant nu. */
  const u = await dmQueryOne<{ name: string | null; email: string; avatar_url: string | null }>(
    actor,
    `SELECT name, email, avatar_url FROM public.users WHERE id = $1::uuid`,
    [peerId],
  )
  if (!u) return null
  return {
    user_id: peerId,
    name: (u.name ?? '').trim() || u.email,
    email: u.email,
    avatar_url: u.avatar_url,
    kind: 'member', role: null,
    presence: 'offline', last_seen_at: null,
    conversation_id: null, unread: 0,
    last_message_at: null, last_message_preview: null, last_message_mine: false,
  }
}

/* ════════════════════════════════════════════════════════════════════
   3. CONVERSATIONS, ACCUSÉS, COMPTEURS
   ═══════════════════════════════════════════════════════════════════ */

interface ConversationRow { id: string; user_a: string; user_b: string }

/**
 * Ceinture et bretelles : la RLS interdit déjà de voir le fil d'autrui,
 * mais on revérifie l'appartenance en SQL explicite pour pouvoir
 * répondre 403. Sans cela, un identifiant volé renverrait une liste
 * vide — indiscernable d'une conversation sans message.
 */
async function loadConversation(actor: Actor, conversationId: string): Promise<ConversationRow | null> {
  return dmQueryOne<ConversationRow>(
    actor,
    `SELECT id, user_a, user_b
       FROM public.dm_conversations
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
        AND $3::uuid IN (user_a, user_b)`,
    [conversationId, actor.tenantId, actor.userId],
  )
}

const peerOf = (conv: ConversationRow, actor: Actor): string =>
  conv.user_a === actor.userId ? conv.user_b : conv.user_a

/**
 * Pose « ✓ Reçu » sur mes messages en attente et prévient leurs
 * expéditeurs.
 *
 * L'expéditeur ne PEUT pas poser cet accusé lui-même : la politique
 * UPDATE de dm_messages le réserve au destinataire. C'est donc au
 * destinataire, à la première occasion où il se manifeste (ouverture du
 * flux, liste des correspondants, chargement d'un fil), de le faire.
 */
async function markDelivered(actor: Actor, conversationId?: string): Promise<void> {
  try {
    const rows = await dmQuery<{ conversation_id: string; sender_id: string; delivered_at: string }>(
      actor,
      `UPDATE public.dm_messages
          SET delivered_at = NOW()
        WHERE recipient_id = $1::uuid
          AND delivered_at IS NULL
          AND ($2::uuid IS NULL OR conversation_id = $2::uuid)
        RETURNING conversation_id, sender_id, delivered_at`,
      [actor.userId, conversationId ?? null],
    )
    if (!rows.length) return

    /* Un seul événement par (fil, expéditeur) : dix messages d'affilée
       ne justifient pas dix trames sur le flux du correspondant. */
    const seen = new Set<string>()
    for (const r of rows) {
      const key = `${r.conversation_id}:${r.sender_id}`
      if (seen.has(key)) continue
      seen.add(key)
      publishToUser(actor.tenantId, r.sender_id, 'delivered', {
        conversation_id: r.conversation_id,
        recipient_id:    actor.userId,
        delivered_at:    r.delivered_at,
      })
    }
  } catch (err: any) {
    /* Un accusé manqué se rattrape au prochain passage : il ne doit
       jamais faire échouer la lecture qui l'a déclenché. */
    logger.error('[messages:delivered]', err.message)
  }
}

/** Compteur global de non-lus d'une personne — lu en son nom. */
async function unreadTotalFor(tenantId: string, userId: string): Promise<number> {
  const row = await asUserQueryOne<{ n: number }>(
    tenantId, userId,
    `SELECT COUNT(*)::int AS n
       FROM public.dm_messages
      WHERE recipient_id = $1::uuid AND read_at IS NULL`,
    [userId],
  )
  return row?.n ?? 0
}

/** Aperçu de liste : un extrait, ou le décompte des pièces jointes. */
function buildPreview(text: string, nbFichiers: number): string {
  if (text) {
    return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text
  }
  return nbFichiers > 1 ? `${nbFichiers} fichiers` : '1 fichier'
}

const MESSAGE_COLUMNS = `id, conversation_id, sender_id, recipient_id, sender_name,
                         body, priority, delivered_at, read_at, created_at`
const FILE_COLUMNS = `id, message_id, filename, mime, size_bytes, uploader_name, created_at`

/** Vue d'un message pour une personne donnée : `mine` en dépend. */
function shapeMessage(row: any, viewerId: string, files: any[]): any {
  return { ...row, mine: row.sender_id === viewerId, files }
}

/* ════════════════════════════════════════════════════════════════════
   4. ROUTES DE LECTURE
   ═══════════════════════════════════════════════════════════════════ */

/** GET /contacts — l'écran Messages en une requête. */
router.get('/contacts', async (req: Request, res: Response) => {
  const actor = getActor(req)
  try {
    /* Consulter la liste, c'est être devant l'application : les
       messages en attente sont donc « reçus ». */
    await markDelivered(actor)

    const contacts = await dmQuery<PeerRow>(actor, CONTACTS_SQL, [actor.userId, actor.tenantId])

    res.json({
      me: { user_id: actor.userId, name: actor.name, kind: actor.kind },
      contacts,
    })
  } catch (err: any) {
    if (moduleAbsent(err)) {
      return res.json({ me: { user_id: actor.userId, name: actor.name, kind: actor.kind }, contacts: [] })
    }
    logger.error('[messages:contacts]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/** GET /unread — la pastille de la barre latérale. */
router.get('/unread', async (req: Request, res: Response) => {
  const actor = getActor(req)
  try {
    const rows = await dmQuery<{ conversation_id: string; peer_id: string; unread: number }>(
      actor,
      `SELECT m.conversation_id,
              CASE WHEN c.user_a = $1::uuid THEN c.user_b ELSE c.user_a END AS peer_id,
              COUNT(*)::int AS unread
         FROM public.dm_messages m
         JOIN public.dm_conversations c ON c.id = m.conversation_id
        WHERE m.recipient_id = $1::uuid AND m.read_at IS NULL
        GROUP BY m.conversation_id, c.user_a, c.user_b
        ORDER BY 3 DESC`,
      [actor.userId],
    )
    res.json({
      total: rows.reduce((n, r) => n + r.unread, 0),
      conversations: rows,
    })
  } catch (err: any) {
    if (moduleAbsent(err)) return res.json({ total: 0, conversations: [] })
    logger.error('[messages:unread]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/** POST /conversations — { user_id } : ouvrir ou créer le fil. */
router.post('/conversations', async (req: Request, res: Response) => {
  const actor = getActor(req)
  const peerId = String(req.body?.user_id ?? '')

  if (!UUID_RE.test(peerId)) return res.status(400).json({ error: 'Correspondant invalide' })
  if (peerId === actor.userId) return res.status(400).json({ error: 'On ne peut pas s\'écrire à soi-même' })

  try {
    /* Un identifiant d'utilisateur valide ailleurs (autre espace,
       compte archivé) n'ouvre pas un fil ici. */
    const peer = await loadPeer(actor, peerId, true)
    if (!peer) return res.status(403).json({ error: 'Correspondant introuvable dans cet espace' })

    /* LEAST/GREATEST reproduit l'ordre canonique exigé par la
       contrainte CHECK (user_a < user_b) ; ON CONFLICT rend l'appel
       idempotent, y compris si les deux personnes cliquent en même
       temps sur « Écrire à ». */
    const conv = await dmQueryOne<{ id: string }>(
      actor,
      `INSERT INTO public.dm_conversations (tenant_id, user_a, user_b)
       VALUES ($1::uuid, LEAST($2::uuid, $3::uuid), GREATEST($2::uuid, $3::uuid))
       ON CONFLICT (tenant_id, user_a, user_b)
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [actor.tenantId, actor.userId, peerId],
    )
    if (!conv) return res.status(500).json({ error: 'Conversation non créée' })

    res.json({
      conversation_id: conv.id,
      peer: { ...peer, conversation_id: conv.id },
    })
  } catch (err: any) {
    if (moduleAbsent(err)) return res.status(503).json(ERREUR_MODULE_ABSENT)
    logger.error('[messages:open]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/** GET /conversations/:id?limit=&before= — le fil, du plus ancien au plus récent. */
router.get('/conversations/:id', async (req: Request, res: Response) => {
  const actor = getActor(req)
  const conversationId = String(req.params.id)
  if (!UUID_RE.test(conversationId)) return res.status(400).json({ error: 'Conversation invalide' })

  const limitRaw = Number(req.query.limit)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 60

  const beforeRaw = typeof req.query.before === 'string' ? req.query.before.trim() : ''
  /* Une date illisible partirait telle quelle vers ::timestamptz et
     ferait tomber la requête en 500 : on la refuse ici. */
  if (beforeRaw && Number.isNaN(Date.parse(beforeRaw))) {
    return res.status(400).json({ error: 'Paramètre « before » invalide' })
  }
  const before = beforeRaw || null

  try {
    const conv = await loadConversation(actor, conversationId)
    if (!conv) return res.status(403).json({ error: 'Accès refusé à cette conversation' })

    await markDelivered(actor, conversationId)

    /* On demande une ligne de plus que nécessaire : sa présence dit
       qu'il reste de l'historique, sans COUNT(*) sur tout le fil. */
    const rows = await dmQuery<any>(
      actor,
      `SELECT ${MESSAGE_COLUMNS}
         FROM public.dm_messages
        WHERE conversation_id = $1::uuid
          AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
        ORDER BY created_at DESC
        LIMIT $3`,
      [conversationId, before, limit + 1],
    )
    const hasMore = rows.length > limit
    const page = (hasMore ? rows.slice(0, limit) : rows).reverse()

    const ids = page.map(m => m.id)
    const files = ids.length
      ? await dmQuery<any>(
          actor,
          `SELECT ${FILE_COLUMNS}
             FROM public.dm_files
            WHERE message_id = ANY($1::uuid[])
            ORDER BY created_at ASC`,
          [ids],
        )
      : []

    const byMessage = new Map<string, any[]>()
    for (const f of files) {
      const list = byMessage.get(f.message_id) ?? []
      list.push(f)
      byMessage.set(f.message_id, list)
    }

    const peer = await loadPeer(actor, peerOf(conv, actor), false)

    res.json({
      conversation: { id: conversationId, peer },
      messages: page.map(m => shapeMessage(m, actor.userId, byMessage.get(m.id) ?? [])),
      has_more: hasMore,
    })
  } catch (err: any) {
    if (moduleAbsent(err)) return res.status(503).json(ERREUR_MODULE_ABSENT)
    logger.error('[messages:thread]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ════════════════════════════════════════════════════════════════════
   5. NOTIFICATIONS — après la réponse, jamais dans le chemin critique
   ═══════════════════════════════════════════════════════════════════ */

interface DmPrefs {
  inapp_enabled:        boolean
  popup_enabled:        boolean
  sound_enabled:        boolean
  browser_enabled:      boolean
  push_enabled:         boolean
  email_enabled:        boolean
  urgent_email_enabled: boolean
}

/** Défauts de la migration 100 — l'absence de ligne n'est pas une
 *  absence de réglage, c'est le réglage d'origine. */
const DEFAULT_PREFS: DmPrefs = {
  inapp_enabled:        true,
  popup_enabled:        true,
  sound_enabled:        true,
  browser_enabled:      true,
  push_enabled:         true,
  email_enabled:        false,
  urgent_email_enabled: true,
}

const PREF_KEYS = Object.keys(DEFAULT_PREFS) as Array<keyof DmPrefs>

async function loadPrefs(tenantId: string, userId: string): Promise<DmPrefs> {
  const row = await asUserQueryOne<DmPrefs>(
    tenantId, userId,
    `SELECT ${PREF_KEYS.join(', ')}
       FROM public.dm_prefs
      WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
    [tenantId, userId],
  )
  return row ?? { ...DEFAULT_PREFS }
}

/* Le slug d'un espace ne change pratiquement jamais et sert à chaque
   notification : le relire à chaque message serait une requête pour
   rien. */
const slugCache = new Map<string, string>()

async function tenantSlug(tenantId: string): Promise<string> {
  const hit = slugCache.get(tenantId)
  if (hit) return hit
  const row = await queryOne<{ slug: string }>(
    `SELECT slug FROM public.tenants WHERE id = $1`, [tenantId],
  )
  const slug = (row?.slug ?? '').trim()
  if (slug) slugCache.set(tenantId, slug)
  return slug
}

/** Origine publique de l'application, pour les liens des e-mails. */
function publicOrigin(): string {
  const raw = process.env.PUBLIC_APP_URL
    ?? process.env.CORS_ORIGINS?.split(',')[0]
    ?? ''
  return raw.trim().replace(/\/+$/, '')
}

interface RecipientInfo { name: string; email: string; is_member: boolean }

async function loadRecipientInfo(actor: Actor, recipientId: string): Promise<RecipientInfo | null> {
  return dmQueryOne<RecipientInfo>(
    actor,
    `SELECT COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', tm.prenom, tm.nom)), ''),
                     NULLIF(BTRIM(u.name), ''),
                     u.email)                       AS name,
            COALESCE(NULLIF(BTRIM(tm.email), ''), u.email) AS email,
            (tm.id IS NOT NULL)                     AS is_member
       FROM public.users u
       LEFT JOIN LATERAL (
         SELECT t.id, t.prenom, t.nom, t.email
           FROM public.team_members t
          WHERE t.tenant_id = $2::uuid AND t.user_id = u.id
          ORDER BY (t.account_status = 'active') DESC, t.created_at DESC
          LIMIT 1
       ) tm ON TRUE
      WHERE u.id = $1::uuid`,
    [recipientId, actor.tenantId],
  )
}

/**
 * Cloche, push et e-mail pour le destinataire.
 *
 * Aucune de ces trois voies ne doit pouvoir faire échouer l'envoi : le
 * message est déjà en base et déjà rendu au client quand cette fonction
 * s'exécute. Chaque étape porte donc son propre filet.
 */
async function notifyRecipient(opts: {
  actor:          Actor
  conversationId: string
  recipientId:    string
  recipient:      RecipientInfo | null
  priority:       DmPriority
  preview:        string
  nbFichiers:     number
}): Promise<void> {
  const { actor, conversationId, recipientId, recipient, priority, preview, nbFichiers } = opts

  const prefs = await loadPrefs(actor.tenantId, recipientId).catch(() => ({ ...DEFAULT_PREFS }))

  /* L'employé et l'administrateur n'ouvrent pas le même écran : un lien
     vers /:slug/messages renverrait un membre d'équipe sur une page
     qu'il n'a pas le droit de charger. */
  const slug = await tenantSlug(actor.tenantId).catch(() => '')
  const link = recipient?.is_member
    ? `/my-space/messagerie?c=${conversationId}`
    : (slug ? `/${slug}/messages?c=${conversationId}` : `/messages?c=${conversationId}`)

  const urgent = priority === 'urgent'
  const titre = urgent ? `Message urgent de ${actor.name}` : `Message de ${actor.name}`

  /* ── Cloche interne ──
     dedupe_key stable par fil : dix messages du même correspondant
     rafraîchissent UNE ligne au lieu d'en empiler dix. DO UPDATE remet
     is_read à faux — un fil relancé redevient une nouveauté. */
  if (prefs.inapp_enabled) {
    try {
      await dmQuery(
        actor,
        `INSERT INTO public.notifications
           (tenant_id, user_id, kind, severity, title, message, link, icon, data, dedupe_key)
         VALUES ($1::uuid, $2::uuid, 'message_prive', $3, $4, $5, $6, '💬', $7::jsonb, $8)
         ON CONFLICT (tenant_id, user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
         DO UPDATE SET severity   = EXCLUDED.severity,
                       title      = EXCLUDED.title,
                       message    = EXCLUDED.message,
                       link       = EXCLUDED.link,
                       data       = EXCLUDED.data,
                       is_read    = FALSE,
                       read_at    = NULL,
                       created_at = NOW()`,
        [
          actor.tenantId, recipientId,
          urgent ? 'critical' : 'info',
          titre, preview, link,
          JSON.stringify({
            conversation_id: conversationId,
            sender_id:       actor.userId,
            sender_name:     actor.name,
            priority,
          }),
          `dm:${conversationId}`,
        ],
      )
    } catch (err: any) {
      logger.error('[messages:notif-row]', err.message)
    }
  }

  /* ── Web Push (application fermée) ── */
  if (prefs.push_enabled) {
    /* Même tag que la cloche : le téléphone remplace la bannière
       précédente du même fil au lieu d'en accumuler une pile. */
    sendPushToUser(actor.tenantId, recipientId, {
      title: titre,
      body:  preview,
      url:   link,
      tag:   `dm-${conversationId}`,
    }).catch(() => {})
  }

  /* ── E-mail ──
     Coupé par défaut pour les messages ordinaires (personne ne veut un
     mail par « ok merci »), gardé pour les urgents : c'est la voie de
     secours quand la personne n'est pas devant l'application. */
  const wantsEmail = urgent
    ? (prefs.urgent_email_enabled || prefs.email_enabled)
    : prefs.email_enabled

  if (wantsEmail && recipient?.email) {
    const origin = publicOrigin()
    void notifyDirectMessage(actor.tenantId, {
      recipientUserId: recipientId,
      recipientEmail:  recipient.email,
      recipientName:   recipient.name,
      senderName:      actor.name,
      preview,
      priority,
      conversationUrl: origin ? `${origin}${link}` : link,
      nbFichiers,
    }).catch((e: any) => logger.error('[messages:notif-mail]', e?.message ?? e))
  }
}

/**
 * Diffusion temps réel + notifications d'un message qui vient de
 * partir. Appelée après `res.json` : son coût n'est jamais dans le
 * temps de réponse de l'expéditeur.
 */
async function dispatchMessage(
  actor: Actor,
  conversationId: string,
  recipientId: string,
  message: any,
  files: any[],
  preview: string,
): Promise<void> {
  try {
    const recipient = await loadRecipientInfo(actor, recipientId).catch(() => null)

    /* Vers le destinataire : le message tel qu'il le verra, et son
       compteur global déjà recalculé — la pastille n'a pas besoin d'un
       aller-retour supplémentaire. */
    publishToUser(actor.tenantId, recipientId, 'message', {
      message:         shapeMessage(message, recipientId, files),
      conversation_id: conversationId,
      peer_id:         actor.userId,
      peer_name:       actor.name,
      unread_total:    await unreadTotalFor(actor.tenantId, recipientId),
    })

    /* Vers MES autres appareils : le téléphone doit afficher ce que je
       viens d'écrire depuis l'ordinateur, du bon côté du fil. */
    publishToUser(actor.tenantId, actor.userId, 'message', {
      message:         shapeMessage(message, actor.userId, files),
      conversation_id: conversationId,
      peer_id:         recipientId,
      peer_name:       recipient?.name ?? '',
      unread_total:    await unreadTotalFor(actor.tenantId, actor.userId),
    })

    if (message.delivered_at) {
      publishToUser(actor.tenantId, actor.userId, 'delivered', {
        conversation_id: conversationId,
        recipient_id:    recipientId,
        delivered_at:    message.delivered_at,
      })
    }

    await notifyRecipient({
      actor, conversationId, recipientId, recipient,
      priority:   message.priority,
      preview,
      nbFichiers: files.length,
    })
  } catch (err: any) {
    logger.error('[messages:dispatch]', err.message)
  }
}

/* ════════════════════════════════════════════════════════════════════
   6. ÉCRITURE
   ═══════════════════════════════════════════════════════════════════ */

/** POST /conversations/:id/messages — { text?, priority?, file_ids? } */
router.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  const actor = getActor(req)
  const conversationId = String(req.params.id)
  if (!UUID_RE.test(conversationId)) return res.status(400).json({ error: 'Conversation invalide' })

  const text = String(req.body?.text ?? '').trim()
  const rawPriority = String(req.body?.priority ?? 'normal')
  const priority: DmPriority = (PRIORITIES as readonly string[]).includes(rawPriority)
    ? rawPriority as DmPriority
    : 'normal'
  const fileIds: string[] = Array.isArray(req.body?.file_ids)
    ? req.body.file_ids.filter((id: unknown) => typeof id === 'string' && UUID_RE.test(id)).slice(0, 20)
    : []

  if (!text && fileIds.length === 0) return res.status(400).json({ error: 'Message vide' })
  if (text.length > MAX_BODY_CHARS) {
    return res.status(400).json({ error: `Message trop long (${MAX_BODY_CHARS} caractères max)` })
  }

  try {
    const conv = await loadConversation(actor, conversationId)
    if (!conv) return res.status(403).json({ error: 'Accès refusé à cette conversation' })
    const recipientId = peerOf(conv, actor)

    /* Le destinataire a-t-il un flux ouvert ? Si oui, le message lui
       parvient dans la seconde : `delivered_at` est posé DÈS L'INSERT.
       Il ne pourrait pas l'être ensuite — la politique UPDATE de
       dm_messages réserve les accusés au destinataire, et l'expéditeur
       serait refusé. */
    const connected = isUserConnected(actor.tenantId, recipientId)

    const { message, files, preview } = await dmTx(actor, async (client) => {
      const ins = await client.query(
        `INSERT INTO public.dm_messages
           (tenant_id, conversation_id, sender_id, recipient_id, sender_name,
            body, priority, delivered_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7,
                 CASE WHEN $8::boolean THEN NOW() ELSE NULL END)
         RETURNING ${MESSAGE_COLUMNS}`,
        [actor.tenantId, conversationId, actor.userId, recipientId,
         actor.name, text, priority, connected],
      )
      const row = ins.rows[0]

      /* Rattachement des pièces jointes déjà téléversées. Le triple
         filtre (conversation, non rattaché, plus la RLS qui exige
         d'être l'auteur du téléversement) empêche de s'approprier le
         fichier d'un autre message en devinant un identifiant. */
      let attached: any[] = []
      if (fileIds.length) {
        await client.query(
          `UPDATE public.dm_files
              SET message_id = $1::uuid
            WHERE id = ANY($2::uuid[])
              AND conversation_id = $3::uuid
              AND message_id IS NULL`,
          [row.id, fileIds, conversationId],
        )
        const f = await client.query(
          `SELECT ${FILE_COLUMNS}
             FROM public.dm_files
            WHERE message_id = $1::uuid
            ORDER BY created_at ASC`,
          [row.id],
        )
        attached = f.rows
      }

      /* Des file_ids tous invalides (déjà rattachés, autre fil) ne
         doivent pas produire une bulle vide dans le fil. */
      if (!text && attached.length === 0) throw new HttpError(400, 'Message vide')

      /* Dénormalisation de la conversation : c'est elle qui alimente la
         liste des correspondants et son tri. Dans la même transaction
         que le message — une liste qui annonce un message inexistant
         serait pire que pas de liste du tout. */
      const apercu = buildPreview(text, attached.length)
      await client.query(
        `UPDATE public.dm_conversations
            SET last_message_at      = $2::timestamptz,
                last_message_preview = $3,
                last_sender_id       = $4::uuid
          WHERE id = $1::uuid`,
        [conversationId, row.created_at, apercu, actor.userId],
      )

      return { message: row, files: attached, preview: apercu }
    })

    res.status(201).json(shapeMessage(message, actor.userId, files))

    /* Après la réponse : l'expéditeur n'attend ni le push ni l'e-mail. */
    void dispatchMessage(actor, conversationId, recipientId, message, files, preview)
  } catch (err: any) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
    logger.error('[messages:send]', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
  }
})

/** POST /conversations/:id/read — j'ouvre le fil, tout devient lu. */
router.post('/conversations/:id/read', async (req: Request, res: Response) => {
  const actor = getActor(req)
  const conversationId = String(req.params.id)
  if (!UUID_RE.test(conversationId)) return res.status(400).json({ error: 'Conversation invalide' })

  try {
    const conv = await loadConversation(actor, conversationId)
    if (!conv) return res.status(403).json({ error: 'Accès refusé à cette conversation' })

    /* Lire, c'est avoir reçu : on rattrape au passage un accusé de
       réception qui aurait manqué (message arrivé pendant que le flux
       était coupé). */
    const rows = await dmQuery<{ sender_id: string; read_at: string }>(
      actor,
      `UPDATE public.dm_messages
          SET read_at      = NOW(),
              delivered_at = COALESCE(delivered_at, NOW())
        WHERE conversation_id = $1::uuid
          AND recipient_id    = $2::uuid
          AND read_at IS NULL
        RETURNING sender_id, read_at`,
      [conversationId, actor.userId],
    )

    res.json({ success: true, read: rows.length })

    if (!rows.length) return

    const readAt = rows[0].read_at
    const base = {
      conversation_id: conversationId,
      reader_id:       actor.userId,
      read_at:         readAt,
    }
    /* DEUX trames, et non une seule dupliquée. `unread_total` est MON
       compteur : envoyé aussi à l'expéditeur, il lui faisait afficher le
       compteur de son correspondant — sa pastille tombait à zéro alors
       qu'il avait des messages non lus ailleurs. Accessoirement, le
       nombre de messages en attente chez quelqu'un d'autre ne le
       regarde pas.
       À l'expéditeur : son « ✓✓ Lu ». À mes autres appareils : de quoi
       retirer la pastille sans recharger la liste. */
    publishToUser(actor.tenantId, peerOf(conv, actor), 'read', base)
    const total = await unreadTotalFor(actor.tenantId, actor.userId).catch(() => 0)
    publishToUser(actor.tenantId, actor.userId, 'read', { ...base, unread_total: total })
  } catch (err: any) {
    logger.error('[messages:read]', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ════════════════════════════════════════════════════════════════════
   7. PIÈCES JOINTES
   ═══════════════════════════════════════════════════════════════════ */

/**
 * POST /conversations/:id/files — le corps brut EST le fichier.
 *
 * En-têtes attendus :
 *   x-filename    nom d'origine, encodé (encodeURIComponent)
 *   content-type  type MIME
 *
 * Écriture au fil de l'eau : rien n'est bufferisé en mémoire, et le
 * compteur d'octets coupe la connexion dès le dépassement plutôt que de
 * découvrir la taille une fois le disque rempli.
 */
router.post('/conversations/:id/files', async (req: Request, res: Response) => {
  const actor = getActor(req)
  const conversationId = String(req.params.id)
  if (!UUID_RE.test(conversationId)) return res.status(400).json({ error: 'Conversation invalide' })

  let conv: ConversationRow | null = null
  try {
    conv = await loadConversation(actor, conversationId)
  } catch (err: any) {
    logger.error('[messages:file-access]', err.message)
    return res.status(500).json({ error: 'Erreur serveur' })
  }
  if (!conv) return res.status(403).json({ error: 'Accès refusé à cette conversation' })

  const rawName = String(req.headers['x-filename'] ?? '')
  let filename = 'fichier'
  try { filename = decodeURIComponent(rawName) || 'fichier' } catch { filename = rawName || 'fichier' }
  /* Le nom d'origine n'est qu'une étiquette : il ne participe jamais au
     chemin sur le disque, donc pas de traversée possible via « ../ ». */
  filename = filename.replace(/[\r\n]/g, '').slice(0, 255)

  const mime = normaliserMime(req.headers['content-type'])

  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared && declared > MAX_UPLOAD_BYTES) {
    return res.status(413).json({
      error: `Fichier trop volumineux (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo maximum)`,
    })
  }

  const ext = path.extname(filename).slice(0, 16).replace(/[^a-zA-Z0-9.]/g, '')
  const relPath = path.join('messages', actor.tenantId, conversationId, `${randomUUID()}${ext}`)
  const absPath = path.join(UPLOAD_DIR, relPath)

  try {
    await mkdir(path.dirname(absPath), { recursive: true })
  } catch (err: any) {
    logger.error('[messages:mkdir]', err.message)
    return res.status(500).json({ error: 'Stockage indisponible' })
  }

  let written = 0
  let aborted = false
  const out = createWriteStream(absPath)

  const cleanup = async () => { try { await unlink(absPath) } catch { /* déjà absent */ } }

  req.on('data', (chunk: Buffer) => {
    written += chunk.length
    if (written > MAX_UPLOAD_BYTES && !aborted) {
      aborted = true
      out.destroy()
      req.destroy()
      void cleanup()
      if (!res.headersSent) {
        res.status(413).json({
          error: `Fichier trop volumineux (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo maximum)`,
        })
      }
    }
  })

  req.on('error', () => { aborted = true; out.destroy(); void cleanup() })

  out.on('error', (err) => {
    logger.error('[messages:write]', err.message)
    aborted = true
    void cleanup()
    if (!res.headersSent) res.status(500).json({ error: 'Écriture impossible' })
  })

  out.on('finish', async () => {
    if (aborted) return
    try {
      const st = await stat(absPath)
      if (st.size === 0) {
        await cleanup()
        return res.status(400).json({ error: 'Fichier vide' })
      }
      /* uploader_id = moi : la politique INSERT de dm_files l'exige, et
         c'est ce qui autorisera plus tard le rattachement au message. */
      const row = await dmQueryOne(
        actor,
        `INSERT INTO public.dm_files
           (tenant_id, conversation_id, filename, mime, size_bytes,
            storage_path, uploader_id, uploader_name)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid, $8)
         RETURNING ${FILE_COLUMNS}`,
        [actor.tenantId, conversationId, filename, mime, st.size,
         relPath, actor.userId, actor.name],
      )
      res.status(201).json(row)
    } catch (err: any) {
      logger.error('[messages:file-row]', err.message)
      await cleanup()
      if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
    }
  })

  req.pipe(out)
})

/**
 * GET /files/:fileId — téléchargement contrôlé.
 * `?inline=1` pour l'affichage des images dans le fil.
 */
router.get('/files/:fileId', async (req: Request, res: Response) => {
  const actor = getActor(req)
  const fileId = String(req.params.fileId)
  if (!UUID_RE.test(fileId)) return res.status(400).json({ error: 'Fichier invalide' })

  try {
    /* La RLS filtre déjà sur l'appartenance à la conversation ; la
       jointure explicite la redit, pour que le contrôle reste lisible
       ici et ne dépende pas d'un seul rempart. */
    const f = await dmQueryOne<{
      filename: string; mime: string; storage_path: string; size_bytes: string | number
    }>(
      actor,
      `SELECT f.filename, f.mime, f.storage_path, f.size_bytes
         FROM public.dm_files f
         JOIN public.dm_conversations c ON c.id = f.conversation_id
        WHERE f.id = $1::uuid
          AND f.tenant_id = $2::uuid
          AND $3::uuid IN (c.user_a, c.user_b)`,
      [fileId, actor.tenantId, actor.userId],
    )
    if (!f) return res.status(404).json({ error: 'Fichier introuvable' })

    const absPath = path.join(UPLOAD_DIR, f.storage_path)
    /* Ceinture et bretelles : storage_path est écrit par le serveur,
       mais on refuse quand même tout chemin sortant du dossier. */
    if (!absPath.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
      return res.status(400).json({ error: 'Chemin invalide' })
    }

    /* Un fichier ne s'ouvre dans le navigateur que s'il est à la fois
       DEMANDÉ en affichage et INCAPABLE d'exécuter quoi que ce soit.
       Tout le reste part en téléchargement, sous un type anonyme : les
       lignes écrites avant ce durcissement portent encore le type
       déclaré par leur expéditeur, ce contrôle les couvre aussi. */
    const affichable = MIME_AFFICHABLES.has(f.mime)
    const inline = req.query.inline === '1' && affichable
    res.setHeader('Content-Type', affichable ? f.mime : BINAIRE_ANONYME)
    res.setHeader('Content-Length', String(f.size_bytes))
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
    )
    /* Le navigateur ne doit JAMAIS deviner le type à la place du serveur :
       sans cet en-tête, un fichier annoncé binaire mais commençant par
       « <html » peut être rendu comme une page. */
    res.setHeader('X-Content-Type-Options', 'nosniff')
    /* Dernier rempart pour ce qui s'affiche. Le PDF en est exempté : son
       lecteur intégré a besoin de son propre bac à sable et cesserait de
       fonctionner sous celui-ci. */
    if (f.mime !== 'application/pdf') {
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:")
    }
    /* Contenu privé : aucun cache partagé ne doit le garder. */
    res.setHeader('Cache-Control', 'private, max-age=3600')

    const stream = createReadStream(absPath)
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'Fichier absent du stockage' })
      else res.end()
    })
    stream.pipe(res)
  } catch (err: any) {
    logger.error('[messages:download]', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ════════════════════════════════════════════════════════════════════
   8. PRÉFÉRENCES
   ═══════════════════════════════════════════════════════════════════ */

/** GET /prefs — les défauts si la personne n'a jamais rien réglé. */
router.get('/prefs', async (req: Request, res: Response) => {
  const actor = getActor(req)
  try {
    /* Pas de 404 et surtout pas d'INSERT : lire ses réglages ne doit
       pas créer de ligne pour chaque personne qui ouvre l'écran. */
    res.json(await loadPrefs(actor.tenantId, actor.userId))
  } catch (err: any) {
    if (moduleAbsent(err)) return res.json({ ...DEFAULT_PREFS })
    logger.error('[messages:prefs-get]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/** PUT /prefs — modification partielle. */
router.put('/prefs', async (req: Request, res: Response) => {
  const actor = getActor(req)

  /* Seuls les booléens explicitement fournis comptent : NULL signifie
     « ne touche pas », et le COALESCE côté SQL s'en charge des deux
     côtés de l'ON CONFLICT. */
  const patch = PREF_KEYS.map(k => (typeof req.body?.[k] === 'boolean' ? req.body[k] : null))

  try {
    /* Un corps sans aucun booléen n'est pas une erreur : c'est un
       enregistrement à vide. On rend l'état courant sans écrire — un
       400 obligerait chaque appelant à filtrer lui-même. */
    if (patch.every(v => v === null)) {
      return res.json({ success: true, prefs: await loadPrefs(actor.tenantId, actor.userId) })
    }
  } catch (err: any) {
    logger.error('[messages:prefs-put]', err.message)
    return res.status(500).json({ error: 'Erreur serveur' })
  }

  const columns = PREF_KEYS.join(', ')
  const inserts = PREF_KEYS.map((k, i) => `COALESCE($${i + 3}::boolean, ${DEFAULT_PREFS[k]})`).join(', ')
  const updates = PREF_KEYS.map((k, i) => `${k} = COALESCE($${i + 3}::boolean, dm_prefs.${k})`).join(', ')

  try {
    const row = await dmQueryOne<DmPrefs>(
      actor,
      `INSERT INTO public.dm_prefs (tenant_id, user_id, ${columns})
       VALUES ($1::uuid, $2::uuid, ${inserts})
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET ${updates}, updated_at = NOW()
       RETURNING ${columns}`,
      [actor.tenantId, actor.userId, ...patch],
    )
    res.json({ success: true, prefs: row ?? { ...DEFAULT_PREFS } })
  } catch (err: any) {
    if (moduleAbsent(err)) return res.status(503).json(ERREUR_MODULE_ABSENT)
    logger.error('[messages:prefs-put]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ════════════════════════════════════════════════════════════════════
   9. FLUX TEMPS RÉEL (SSE)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * GET /stream — un canal ouvert par onglet.
 *
 * Pourquoi SSE et pas WebSocket : le trafic est à sens unique
 * (serveur → client), SSE passe par la même pile HTTP que le reste de
 * l'API — donc le même CORS, le même jeton, le même proxy — et le
 * navigateur se reconnecte seul. Un WebSocket aurait imposé une
 * seconde authentification et un second chemin d'exploitation.
 *
 * Les en-têtes anti-tampon sont indispensables : sans
 * `X-Accel-Buffering: no` ni `no-transform`, un proxy accumule les
 * trames et le « temps réel » arrive par paquets de plusieurs minutes.
 */
router.get('/stream', async (req: Request, res: Response) => {
  const actor = getActor(req)

  /* Au-delà du plafond, ce n'est plus un utilisateur avec quelques
     onglets : c'est un client qui boucle sur sa reconnexion. */
  if (streamCount(actor.tenantId, actor.userId) >= MAX_STREAMS_PER_USER) {
    return res.status(429).json({ error: 'Trop de connexions simultanées' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  /* Un flux qui dure des heures : ni le socket ni Nagle ne doivent
     retarder ou couper une trame de quelques octets. */
  req.socket.setTimeout(0)
  req.socket.setNoDelay(true)
  req.socket.setKeepAlive(true)

  let closed = false

  /* Déclaré avant `write` : une écriture qui échoue doit fermer POUR DE
     BON. Auparavant elle se contentait de lever le drapeau, laissant le
     battement de 25 s écrire sur une socket morte et l'abonnement
     survivre dans le bus — donc `isUserConnected` répondait « oui » pour
     quelqu'un qui n'était plus là, et son correspondant voyait un
     « ✓✓ Reçu » mensonger. */
  let close: () => void = () => { closed = true }

  const write = (event: string, data: unknown) => {
    if (closed) return
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    } catch {
      close()
    }
  }

  write('ready', { server_time: new Date().toISOString() })

  const unsubscribe = subscribeUser(actor.tenantId, actor.userId, (event, data) => write(event, data))

  /* Commentaire SSE toutes les 25 s : il ne déclenche aucun événement
     côté client mais empêche les proxys (et les mobiles) de considérer
     la connexion comme morte. */
  const ping = setInterval(() => {
    if (closed) return
    try { res.write(':ping\n\n') } catch { close() }
  }, 25_000)

  close = () => {
    if (closed) return
    closed = true
    clearInterval(ping)
    unsubscribe()
    try { res.end() } catch { /* déjà fermé */ }
  }

  req.on('close', close)
  req.on('error', close)
  res.on('close', close)

  /* L'abonnement est posé AVANT ce rattrapage : un message qui
     arriverait pendant ne doit pas tomber dans le vide, et les accusés
     publiés ici doivent partir vers leurs expéditeurs. */
  try {
    await markDelivered(actor)
    const total = await unreadTotalFor(actor.tenantId, actor.userId)
    write('unread', { total })
  } catch (err: any) {
    /* Base pas encore migrée : le flux reste ouvert et muet plutôt que
       de refermer aussitôt — le client se reconnecterait en boucle. */
    if (!moduleAbsent(err)) logger.error('[messages:stream-init]', err.message)
  }
})

export default router
