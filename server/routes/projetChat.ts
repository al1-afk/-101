/**
 * Discussion projet — API unifiée admin ET membre.
 *
 *   GET  /api/projet-chat/:projetId/messages   fil + pièces jointes + lectures
 *   POST /api/projet-chat/:projetId/messages   publier (texte et/ou fichiers)
 *   POST /api/projet-chat/:projetId/read       poser mon curseur de lecture
 *   POST /api/projet-chat/:projetId/files      téléverser un fichier
 *   GET  /api/projet-chat/files/:fileId        télécharger un fichier
 *
 * ── Pourquoi une route commune ────────────────────────────────────
 * Le fil était lu par deux chemins différents : le CRUD générique côté
 * admin (qui chargeait 1 000 messages du tenant pour en filtrer un
 * projet) et /api/my-space côté membre. Les accusés de lecture, les
 * pièces jointes et les notifications ont besoin des mêmes règles pour
 * les deux publics : les dupliquer, c'est les faire diverger.
 *
 * ── Fichiers ──────────────────────────────────────────────────────
 * Le corps de la requête est écrit directement sur le disque, sans
 * passer par la mémoire : un téléversement de 100 Mo ne coûte que la
 * taille d'un tampon. express.json() ne touche pas ces requêtes, leur
 * Content-Type n'étant pas du JSON.
 *
 * Les fichiers vivent sur un volume Docker (UPLOAD_DIR). Ils ne sont
 * jamais servis en statique : chaque téléchargement repasse par le
 * contrôle d'accès du projet.
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { logger } from '../lib/logger'
import { sendPushToUser } from '../lib/webPush'
import { notifyNewProjetMessage } from '../lib/notificationEmails'
import { UPLOAD_DIR } from '../lib/uploadStorage'
import { normaliserMime, entetesFichier } from '../lib/fichiersMime'

const router = Router()
router.use(requireAuth)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i


/** Plafond par fichier. Réglable sans redéploiement de code. */
const MAX_UPLOAD_BYTES = Number(process.env.CHAT_MAX_UPLOAD_MB || 100) * 1024 * 1024

/* ── Qui parle ─────────────────────────────────────────────────────
   Deux publics, une seule représentation en aval : un acteur porte un
   nom affichable et exactement un identifiant (compte admin OU membre). */
interface Actor {
  tenantId:      string
  name:          string
  isAdmin:       boolean
  /** users.id de la personne connectée — un membre en possède un aussi.
   *  Sert à ne pas se notifier soi-même. */
  accountUserId: string
  /** Colonne author_user_id : renseignée pour un compte admin seulement. */
  userId?:       string
  teamMemberId?: string
}

async function resolveActor(req: Request): Promise<Actor | null> {
  const tenantId = req.user!.tenantId

  if (req.user!.role === 'team_member') {
    const m = await tenantQueryOne<{ id: string; prenom: string | null; nom: string | null; email: string; account_status: string }>(
      tenantId,
      `SELECT id, prenom, nom, email, account_status
         FROM public.team_members
        WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.user!.userId, tenantId],
    )
    if (!m || m.account_status !== 'active') return null
    return {
      tenantId,
      accountUserId: req.user!.userId,
      teamMemberId: m.id,
      name: [m.prenom, m.nom].filter(Boolean).join(' ').trim() || m.email,
      isAdmin: false,
    }
  }

  const u = await tenantQueryOne<{ name: string | null; email: string }>(
    tenantId,
    `SELECT name, email FROM public.users WHERE id = $1`,
    [req.user!.userId],
  )
  return {
    tenantId,
    accountUserId: req.user!.userId,
    userId: req.user!.userId,
    name: (u?.name ?? '').trim() || u?.email || 'Admin',
    isAdmin: true,
  }
}

/**
 * Un membre n'accède qu'aux projets sur lesquels il travaille —
 * assigné directement, via sa fiche stagiaire, ou porteur d'une tâche.
 * Un compte admin voit tous les projets de son espace.
 */
async function canAccessProjet(actor: Actor, projetId: string): Promise<boolean> {
  const projet = await tenantQueryOne(
    actor.tenantId,
    `SELECT 1 FROM public.projets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [projetId, actor.tenantId],
  )
  if (!projet) return false
  if (actor.isAdmin) return true

  const assigned = await tenantQueryOne(
    actor.tenantId,
    `SELECT 1
       WHERE EXISTS (SELECT 1 FROM public.projet_assignees
                      WHERE projet_id = $2
                        AND (team_member_id = $1
                             OR stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1)))
          OR EXISTS (SELECT 1 FROM public.team_member_tasks
                      WHERE project_id = $2
                        AND (team_member_id = $1
                             OR assigned_stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1)))
       LIMIT 1`,
    [actor.teamMemberId, projetId],
  )
  return !!assigned
}

/** Middleware : résout l'acteur et vérifie l'accès au projet de l'URL. */
async function withProjetAccess(req: Request, res: Response, next: NextFunction) {
  const projetId = String(req.params.projetId)
  if (!UUID_RE.test(projetId)) return res.status(400).json({ error: 'Projet invalide' })

  const actor = await resolveActor(req)
  if (!actor) return res.status(403).json({ error: 'Compte inactif' })
  if (!(await canAccessProjet(actor, projetId))) {
    return res.status(403).json({ error: 'Accès refusé à ce projet' })
  }
  ;(req as any).actor = actor
  next()
}

const getActor = (req: Request): Actor => (req as any).actor

/* ────────────────────────────────────────────────────────────────── */

/** GET /:projetId/messages — le fil, ses fichiers, et qui a lu jusqu'où. */
router.get('/:projetId/messages', withProjetAccess, async (req: Request, res: Response) => {
  const actor = getActor(req)
  const projetId = String(req.params.projetId)

  try {
    const messages = await tenantQuery(
      actor.tenantId,
      `SELECT id, projet_id, author_name, author_user_id, author_team_member_id,
              is_admin, text, created_at
         FROM public.projet_messages
        WHERE projet_id = $1
        ORDER BY created_at ASC
        LIMIT 500`,
      [projetId],
    )

    const files = await tenantQuery(
      actor.tenantId,
      `SELECT id, message_id, filename, mime, size_bytes, uploader_name, created_at
         FROM public.projet_message_files
        WHERE projet_id = $1 AND message_id IS NOT NULL
        ORDER BY created_at ASC`,
      [projetId],
    )

    /* Curseurs de lecture : le client en déduit « vu » message par
       message, plutôt que de faire calculer N × M lignes au serveur. */
    const readers = await tenantQuery<any>(
      actor.tenantId,
      `SELECT reader_name, last_read_at, reader_user_id, reader_team_member_id
         FROM public.projet_chat_reads
        WHERE projet_id = $1`,
      [projetId],
    )

    const byMessage = new Map<string, any[]>()
    for (const f of files as any[]) {
      const list = byMessage.get(f.message_id) ?? []
      list.push(f)
      byMessage.set(f.message_id, list)
    }

    res.json({
      messages: (messages as any[]).map(m => ({ ...m, files: byMessage.get(m.id) ?? [] })),
      readers: (readers as any[]).map(r => ({
        name:         r.reader_name,
        last_read_at: r.last_read_at,
        is_me:        (!!actor.userId       && r.reader_user_id        === actor.userId)
                   || (!!actor.teamMemberId && r.reader_team_member_id === actor.teamMemberId),
      })),
      me: { name: actor.name, is_admin: actor.isAdmin },
    })
  } catch (err: any) {
    logger.error('[projet-chat:list]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/** POST /:projetId/read — je viens de lire le fil jusqu'à maintenant. */
router.post('/:projetId/read', withProjetAccess, async (req: Request, res: Response) => {
  const actor = getActor(req)
  const projetId = String(req.params.projetId)

  try {
    /* ON CONFLICT vise les index partiels : un curseur par personne. */
    if (actor.userId) {
      await tenantQuery(
        actor.tenantId,
        `INSERT INTO public.projet_chat_reads
           (tenant_id, projet_id, reader_user_id, reader_name, last_read_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (projet_id, reader_user_id) WHERE reader_user_id IS NOT NULL
         DO UPDATE SET last_read_at = NOW(), reader_name = EXCLUDED.reader_name`,
        [actor.tenantId, projetId, actor.userId, actor.name],
      )
    } else {
      await tenantQuery(
        actor.tenantId,
        `INSERT INTO public.projet_chat_reads
           (tenant_id, projet_id, reader_team_member_id, reader_name, last_read_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (projet_id, reader_team_member_id) WHERE reader_team_member_id IS NOT NULL
         DO UPDATE SET last_read_at = NOW(), reader_name = EXCLUDED.reader_name`,
        [actor.tenantId, projetId, actor.teamMemberId, actor.name],
      )
    }
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[projet-chat:read]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * Prévient tout le monde sauf l'auteur : membres assignés au projet et
 * comptes admin de l'espace. Cloche interne, notification navigateur,
 * et e-mail aux admins si l'espace a gardé la catégorie `projet_message`
 * dans ses réglages (migration 096).
 * Volontairement « fire and forget » : un push qui échoue ne doit pas
 * faire échouer l'envoi du message.
 */
async function notifyParticipants(
  actor: Actor,
  projetId: string,
  projetNom: string,
  preview: string,
  nbFichiers = 0,
) {
  /* E-mail : la catégorie est filtrée dans notificationEmails, et
     l'auteur est exclu s'il possède un compte admin. */
  void notifyNewProjetMessage(actor.tenantId, {
    projetNom, projetId,
    auteur: actor.name,
    apercu: preview,
    nbFichiers,
    exceptUserId: actor.accountUserId,
  }).catch(() => {})

  try {
    const rows = await tenantQuery<{ user_id: string }>(
      actor.tenantId,
      `SELECT DISTINCT u.user_id FROM (
         SELECT tm.user_id
           FROM public.projet_assignees pa
           JOIN public.team_members tm ON tm.id = pa.team_member_id
          WHERE pa.projet_id = $1 AND tm.user_id IS NOT NULL
            AND tm.account_status = 'active'
         UNION
         SELECT tu.user_id
           FROM public.tenant_users tu
          WHERE tu.tenant_id = $2 AND tu.status = 'active'
            AND tu.role IN ('admin', 'manager')
       ) u
       WHERE u.user_id IS NOT NULL`,
      [projetId, actor.tenantId],
    )

    const targets = rows
      .map(r => r.user_id)
      .filter(uid => uid !== actor.accountUserId)

    for (const userId of targets) {
      await tenantQuery(
        actor.tenantId,
        `INSERT INTO public.notifications
           (tenant_id, user_id, kind, severity, title, message, link, icon, data)
         VALUES ($1, $2, 'projet_message', 'info', $3, $4, $5, '💬', $6::jsonb)`,
        [
          actor.tenantId, userId,
          `Nouveau message — ${projetNom}`,
          `${actor.name} : ${preview}`,
          `/projets/${projetId}`,
          JSON.stringify({ projet_id: projetId, author: actor.name }),
        ],
      ).catch(e => logger.error('[projet-chat:notif-row]', e.message))

      sendPushToUser(actor.tenantId, userId, {
        title: `💬 ${projetNom}`,
        body:  `${actor.name} : ${preview}`,
        url:   `/projets/${projetId}`,
        /* Même tag : cinq messages d'affilée ne font pas cinq bannières. */
        tag:   `projet-chat-${projetId}`,
      }).catch(() => {})
    }
  } catch (e: any) {
    logger.error('[projet-chat:notify]', e.message)
  }
}

/** POST /:projetId/messages — { text?, file_ids? } */
router.post('/:projetId/messages', withProjetAccess, async (req: Request, res: Response) => {
  const actor = getActor(req)
  const projetId = String(req.params.projetId)

  const text = String(req.body?.text ?? '').trim()
  const fileIds: string[] = Array.isArray(req.body?.file_ids)
    ? req.body.file_ids.filter((id: unknown) => typeof id === 'string' && UUID_RE.test(id)).slice(0, 50)
    : []

  if (!text && fileIds.length === 0) return res.status(400).json({ error: 'Message vide' })
  if (text.length > 4000) return res.status(400).json({ error: 'Message trop long (4000 caractères max)' })

  try {
    const msg = await tenantQueryOne<{ id: string }>(
      actor.tenantId,
      `INSERT INTO public.projet_messages
         (tenant_id, projet_id, author_user_id, author_team_member_id, author_name, is_admin, text)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, projet_id, author_name, author_user_id, author_team_member_id, is_admin, text, created_at`,
      [actor.tenantId, projetId, actor.userId ?? null, actor.teamMemberId ?? null,
       actor.name, actor.isAdmin, text],
    )

    /* Rattachement des fichiers déjà téléversés. Le filtre sur projet_id
       et message_id IS NULL empêche de s'approprier la pièce jointe d'un
       autre message ou d'un autre projet en devinant un identifiant. */
    if (fileIds.length) {
      await tenantQuery(
        actor.tenantId,
        `UPDATE public.projet_message_files
            SET message_id = $1
          WHERE id = ANY($2::uuid[]) AND projet_id = $3 AND message_id IS NULL`,
        [(msg as any).id, fileIds, projetId],
      )
    }

    const files = await tenantQuery(
      actor.tenantId,
      `SELECT id, message_id, filename, mime, size_bytes, uploader_name, created_at
         FROM public.projet_message_files WHERE message_id = $1 ORDER BY created_at ASC`,
      [(msg as any).id],
    )

    res.status(201).json({ ...(msg as any), files })

    /* Après la réponse : l'expéditeur n'attend pas les notifications. */
    const projet = await tenantQueryOne<{ nom: string }>(
      actor.tenantId, `SELECT nom FROM public.projets WHERE id = $1`, [projetId],
    )
    const preview = text
      ? (text.length > 90 ? `${text.slice(0, 90)}…` : text)
      : `${files.length} fichier${files.length > 1 ? 's' : ''}`
    void notifyParticipants(actor, projetId, projet?.nom ?? 'Projet', preview, files.length)
  } catch (err: any) {
    logger.error('[projet-chat:post]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * POST /:projetId/files — le corps brut EST le fichier.
 *
 * En-têtes attendus :
 *   x-filename    nom d'origine, encodé (encodeURIComponent)
 *   content-type  type MIME
 *
 * Le flux est écrit au fil de l'eau : rien n'est bufferisé en mémoire,
 * et le compteur d'octets coupe la connexion dès le dépassement plutôt
 * que de découvrir la taille une fois le disque rempli.
 */
router.post('/:projetId/files', withProjetAccess, async (req: Request, res: Response) => {
  const actor = getActor(req)
  const projetId = String(req.params.projetId)

  const rawName = String(req.headers['x-filename'] ?? '')
  let filename = 'fichier'
  try { filename = decodeURIComponent(rawName) || 'fichier' } catch { filename = rawName || 'fichier' }
  /* Le nom d'origine n'est qu'une étiquette : il ne participe jamais au
     chemin sur le disque, donc pas de traversée possible via « ../ ». */
  filename = filename.replace(/[\r\n]/g, '').slice(0, 255)

  /* Liste blanche partagée (server/lib/fichiersMime.ts) : un type inconnu
     n'interdit pas le fichier, il le rend inoffensif — stocké et resservi
     comme du binaire, donc téléchargé, jamais ouvert dans l'origine de
     l'application. */
  const mime = normaliserMime(req.headers['content-type'])

  /* « bibliotheque » = fichier déposé sciemment dans l'espace du projet,
     qui n'attend aucun message. « chat » (défaut) = pièce jointe en
     cours d'envoi. La distinction protège la bibliothèque de la purge
     des téléversements abandonnés (migration 105). */
  const origine = req.query.origine === 'bibliotheque' ? 'bibliotheque' : 'chat'

  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared && declared > MAX_UPLOAD_BYTES) {
    return res.status(413).json({
      error: `Fichier trop volumineux (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo maximum)`,
    })
  }

  const ext = path.extname(filename).slice(0, 16).replace(/[^a-zA-Z0-9.]/g, '')
  const relPath = path.join('projet-chat', actor.tenantId, projetId, `${randomUUID()}${ext}`)
  const absPath = path.join(UPLOAD_DIR, relPath)

  try {
    await mkdir(path.dirname(absPath), { recursive: true })
  } catch (e: any) {
    logger.error('[projet-chat:mkdir]', e.message)
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

  out.on('error', (e) => {
    logger.error('[projet-chat:write]', e.message)
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
      const row = await tenantQueryOne(
        actor.tenantId,
        `INSERT INTO public.projet_message_files
           (tenant_id, projet_id, filename, mime, size_bytes, storage_path,
            uploader_name, uploader_user_id, uploader_team_member_id, origine)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, filename, mime, size_bytes, uploader_name, created_at, origine`,
        [actor.tenantId, projetId, filename, mime, st.size, relPath,
         actor.name, actor.userId ?? null, actor.teamMemberId ?? null, origine],
      )
      res.status(201).json(row)
    } catch (e: any) {
      logger.error('[projet-chat:file-row]', e.message)
      await cleanup()
      if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
    }
  })

  req.pipe(out)
})

/* ════════════════════════════════════════════════════════════════════
   BIBLIOTHÈQUE DE FICHIERS DU PROJET

   « Quand un employé m'envoie un fichier par e-mail ou par Google Drive,
   je veux pouvoir le déposer ici, le retrouver, le télécharger sur mon
   ordinateur et le supprimer. »

   Trois routes seulement, parce que le reste existait déjà : le dépôt
   est le POST ci-dessus (avec ?origine=bibliotheque), le téléchargement
   est le GET /files/:fileId, et le contrôle d'accès au projet est
   `withProjetAccess`. Il ne manquait, littéralement, qu'une liste et une
   suppression.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * GET /:projetId/files — tous les fichiers du projet, du plus récent au
 * plus ancien.
 *
 * On renvoie AUSSI les pièces jointes de la discussion, marquées
 * `origine: 'chat'`. C'est le sens de la demande : « gérer les fichiers
 * reçus des employés sans devoir retourner à l'e-mail » — un écran qui
 * cacherait le fichier envoyé dans le chat obligerait à le chercher
 * ailleurs, c'est-à-dire exactement ce qu'on veut supprimer.
 *
 * `?origine=bibliotheque` restreint aux dépôts directs pour qui veut la
 * liste stricte.
 */
router.get('/:projetId/files', withProjetAccess, async (req: Request, res: Response) => {
  const actor = getActor(req)
  const projetId = String(req.params.projetId)
  const filtre = req.query.origine === 'bibliotheque' ? 'bibliotheque' : null

  try {
    const files = await tenantQuery(
      actor.tenantId,
      `SELECT id, filename, mime, size_bytes, uploader_name, created_at,
              origine, (message_id IS NOT NULL) AS dans_un_message,
              /* Calculé ici, avec la MÊME règle que la route DELETE :
                 l'écran ne doit pas proposer un bouton qui répondra 403,
                 et il ne doit pas non plus deviner la règle de son côté.
                 Le serveur reste seul juge — ceci n'est qu'un affichage
                 fidèle de sa décision. */
              ($3::boolean
               OR ($4::uuid IS NOT NULL AND uploader_user_id = $4::uuid)
               OR ($5::uuid IS NOT NULL AND uploader_team_member_id = $5::uuid)) AS peut_supprimer
         FROM public.projet_message_files
        WHERE projet_id = $1
          AND ($2::text IS NULL OR origine = $2)
          /* Un téléversement de chat sans message est un envoi
             abandonné : il n'a jamais été montré à personne, il n'a
             rien à faire dans une liste de fichiers. */
          AND NOT (origine = 'chat' AND message_id IS NULL)
        ORDER BY created_at DESC
        LIMIT 500`,
      [projetId, filtre, actor.isAdmin,
       actor.isAdmin ? actor.accountUserId : null,
       actor.isAdmin ? null : actor.teamMemberId],
    )
    res.json(files)
  } catch (err: any) {
    /* La migration 105 n'est pas encore passée sur cette base : la
       colonne `origine` manque (42703). On ne masque pas le problème —
       une liste vide ferait croire à un espace sans fichiers, et le
       premier dépôt semblerait s'évaporer. */
    if (err?.code === '42703') {
      return res.status(503).json({ error: 'Bibliothèque de fichiers non installée — migration 105 à appliquer.' })
    }
    logger.error('[projet-chat:files-list]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * DELETE /files/:fileId — retire un fichier du projet.
 *
 * ── Qui peut supprimer ──────────────────────────────────────────────
 * L'administration de l'espace, et le déposant. Un employé peut donc
 * retirer ce qu'il a mis — un mauvais fichier, une version périmée —
 * mais pas ce qu'un autre a déposé. Le rôle est relu par requireAuth,
 * rien du corps de la requête ne participe à la décision.
 *
 * ── La ligne d'abord, le fichier ensuite ────────────────────────────
 * Même ordre que la suppression des images de SOP : si le DELETE échoue,
 * on n'a rien perdu ; si c'est le `unlink` qui échoue, il reste un
 * fichier orphelin sur le disque — invisible, sans référence, et que la
 * prochaine purge ramassera. L'inverse laisserait une ligne qui promet
 * un contenu disparu, c'est-à-dire un « télécharger » qui répond 404.
 */
router.delete('/files/:fileId', async (req: Request, res: Response) => {
  const fileId = String(req.params.fileId)
  if (!UUID_RE.test(fileId)) return res.status(400).json({ error: 'Fichier invalide' })

  try {
    const actor = await resolveActor(req)
    if (!actor) return res.status(403).json({ error: 'Compte inactif' })

    const f = await tenantQueryOne<{
      projet_id: string; storage_path: string; filename: string
      uploader_user_id: string | null; uploader_team_member_id: string | null
    }>(
      actor.tenantId,
      `SELECT projet_id, storage_path, filename, uploader_user_id, uploader_team_member_id
         FROM public.projet_message_files WHERE id = $1`,
      [fileId],
    )
    if (!f) return res.status(404).json({ error: 'Fichier introuvable' })
    if (!(await canAccessProjet(actor, f.projet_id))) {
      return res.status(403).json({ error: 'Accès refusé à ce projet' })
    }

    const deposant = actor.isAdmin
      ? f.uploader_user_id === actor.accountUserId
      : f.uploader_team_member_id === actor.teamMemberId
    if (!actor.isAdmin && !deposant) {
      return res.status(403).json({ error: 'Vous ne pouvez retirer que les fichiers que vous avez déposés' })
    }

    await tenantQuery(
      actor.tenantId,
      `DELETE FROM public.projet_message_files WHERE id = $1`,
      [fileId],
    )

    const absPath = path.join(UPLOAD_DIR, f.storage_path)
    if (absPath.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
      try { await unlink(absPath) } catch { /* déjà absent : la ligne est partie, c'est l'essentiel */ }
    }

    res.json({ success: true })
  } catch (err: any) {
    logger.error('[projet-chat:file-delete]', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * GET /files/:fileId — téléchargement contrôlé.
 * `?inline=1` pour l'affichage des images dans le fil.
 */
router.get('/files/:fileId', async (req: Request, res: Response) => {
  const fileId = String(req.params.fileId)
  if (!UUID_RE.test(fileId)) return res.status(400).json({ error: 'Fichier invalide' })

  try {
    const actor = await resolveActor(req)
    if (!actor) return res.status(403).json({ error: 'Compte inactif' })

    const f = await tenantQueryOne<{
      projet_id: string; filename: string; mime: string; storage_path: string; size_bytes: string
    }>(
      actor.tenantId,
      `SELECT projet_id, filename, mime, storage_path, size_bytes
         FROM public.projet_message_files WHERE id = $1`,
      [fileId],
    )
    if (!f) return res.status(404).json({ error: 'Fichier introuvable' })
    if (!(await canAccessProjet(actor, f.projet_id))) {
      return res.status(403).json({ error: 'Accès refusé' })
    }

    const absPath = path.join(UPLOAD_DIR, f.storage_path)
    /* Ceinture et bretelles : storage_path est écrit par le serveur, mais
       on refuse quand même tout chemin qui sortirait du dossier. */
    if (!absPath.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
      return res.status(400).json({ error: 'Chemin invalide' })
    }

    /* En-têtes durcis, partagés avec la messagerie privée : nosniff,
       affichage refusé à tout type qui pourrait exécuter du script, et
       type anonyme pour le reste. Les lignes enregistrées avant ce
       durcissement portent encore le type déclaré par leur expéditeur —
       ce contrôle à la SORTIE les couvre aussi. */
    entetesFichier(res, f, req.query.inline === '1')

    const stream = createReadStream(absPath)
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'Fichier absent du stockage' })
      else res.end()
    })
    stream.pipe(res)
  } catch (err: any) {
    logger.error('[projet-chat:download]', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
