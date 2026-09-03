/**
 * Member-only endpoints. Requires JWT with role === 'team_member'.
 *
 *  GET    /api/my-space/dashboard         — stats overview
 *  GET    /api/my-space/profile           — full profile
 *  PUT    /api/my-space/profile           — update phone/avatar
 *  PUT    /api/my-space/password          — change password
 *  GET    /api/my-space/tasks             — my tasks
 *  PATCH  /api/my-space/tasks/:id         — update status
 *  GET    /api/my-space/sops              — SOPs filtered by my access
 *  GET    /api/my-space/sops/:id          — single SOP (if I have access)
 *  POST   /api/my-space/sops/activity     — log a SOP-viewed action
 */
import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import { query, queryOne, tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { logger } from '../lib/logger'
import { sendPushToUser } from '../lib/webPush'
import { notifyMemberTaskCreated } from '../lib/notificationEmails'

const router = Router()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* All routes require a team_member JWT */
router.use(requireAuth)
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'team_member') {
    return res.status(403).json({ error: 'Espace réservé aux membres' })
  }
  next()
})

/* Resolve the team_member row for the current user (cached per-request via res.locals) */
async function resolveMember(req: Request): Promise<{ id: string; tenantId: string } | null> {
  if ((req as any)._memberCache) return (req as any)._memberCache
  const row = await tenantQueryOne<{ id: string; tenant_id: string; account_status: string }>(
    req.user!.tenantId,
    `SELECT id, tenant_id, account_status
       FROM public.team_members
      WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
    [req.user!.userId, req.user!.tenantId],
  )
  if (!row || row.account_status !== 'active') return null
  const cached = { id: row.id, tenantId: row.tenant_id }
  ;(req as any)._memberCache = cached
  return cached
}

async function logActivity(
  tenantId: string,
  teamMemberId: string,
  actionType: string,
  details: Record<string, unknown> = {},
  ip?: string,
  ua?: string,
) {
  try {
    await tenantQuery(
      tenantId,
      `INSERT INTO public.team_member_activity (tenant_id, team_member_id, action_type, action_details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4::jsonb, $5::inet, $6)`,
      [tenantId, teamMemberId, actionType, JSON.stringify(details), ip ?? null, ua ?? null],
    )
  } catch (e: any) { logger.error('[my-space:activity]', e.message) }
}

/* ────────────────────────────────────────────────────────────────── */

/* GET /api/my-space/profile */
router.get('/profile', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  try {
    const profile = await tenantQueryOne(
      m.tenantId,
      `SELECT m.id, m.prenom AS first_name, m.nom AS last_name, m.email, m.telephone,
              m.job_title, m.member_type, m.avatar_url, m.last_login_at, m.created_at,
              m.invitation_accepted_at,
              COALESCE(
                (SELECT json_agg(json_build_object('category', sop_category, 'level', access_level))
                   FROM public.team_member_sop_access WHERE team_member_id = m.id), '[]'::json
              ) AS access
         FROM public.team_members m WHERE m.id = $1`,
      [m.id],
    )
    res.json(profile)
  } catch (err: any) {
    logger.error('[my-space:profile]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PUT /api/my-space/profile — limited fields the member can edit */
router.put('/profile', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const allowed = ['telephone','avatar_url']
  const data: Record<string, any> = {}
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k]
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })

  const keys = Object.keys(data)
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  try {
    await tenantQuery(
      m.tenantId,
      `UPDATE public.team_members SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1}`,
      [...keys.map(k => data[k]), m.id],
    )
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[my-space:profile-put]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PUT /api/my-space/password */
router.put('/password', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const { current_password, new_password } = req.body
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Ancien et nouveau mot de passe requis' })
  }
  if (new_password.length < 8) return res.status(400).json({ error: 'Nouveau mot de passe : minimum 8 caractères' })
  if (!/[0-9]/.test(new_password)) return res.status(400).json({ error: 'Doit contenir au moins un chiffre' })

  try {
    const user = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM public.users WHERE id = $1`, [req.user!.userId],
    )
    if (!user) return res.status(404).json({ error: 'Compte introuvable' })

    const ok = await bcrypt.compare(current_password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Ancien mot de passe incorrect' })

    const hash = await bcrypt.hash(new_password, 12)
    await query(`UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, req.user!.userId])
    await logActivity(m.tenantId, m.id, 'password_changed', {}, req.ip, req.headers['user-agent'] as string)
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[my-space:password]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /api/my-space/dashboard */
router.get('/dashboard', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  try {
    const [profile, accessRows, taskStats, recentActivity, sopCounts] = await Promise.all([
      tenantQueryOne<{ first_name: string; last_name: string; job_title: string | null; last_login_at: string | null }>(
        m.tenantId,
        `SELECT prenom AS first_name, nom AS last_name, job_title, last_login_at
           FROM public.team_members WHERE id = $1`, [m.id],
      ),
      tenantQuery<{ sop_category: string; access_level: string }>(
        m.tenantId,
        `SELECT sop_category, access_level FROM public.team_member_sop_access WHERE team_member_id = $1`, [m.id],
      ),
      tenantQueryOne<{ total: number; done: number; in_progress: number; todo: number; overdue: number }>(
        m.tenantId,
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'done')::int        AS done,
                COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
                COUNT(*) FILTER (WHERE status = 'todo')::int        AS todo,
                COUNT(*) FILTER (WHERE status IN ('todo','in_progress') AND due_date < CURRENT_DATE)::int AS overdue
           FROM public.team_member_tasks
          WHERE team_member_id = $1
             OR assigned_stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1)`, [m.id],
      ),
      tenantQuery(
        m.tenantId,
        `SELECT action_type, action_details, created_at
           FROM public.team_member_activity WHERE team_member_id = $1
           ORDER BY created_at DESC LIMIT 10`, [m.id],
      ),
      tenantQuery<{ category: string; count: number }>(
        m.tenantId,
        `SELECT category, COUNT(*)::int AS count FROM public.sops GROUP BY category`,
      ),
    ])

    const sopCountByCat: Record<string, number> = {}
    for (const r of sopCounts) sopCountByCat[r.category] = r.count

    res.json({
      profile,
      access: accessRows.map(r => ({
        category: r.sop_category,
        level:    r.access_level,
        total_sops: sopCountByCat[r.sop_category] ?? 0,
      })),
      tasks: taskStats,
      recent_activity: recentActivity,
    })
  } catch (err: any) {
    logger.error('[my-space:dashboard]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /api/my-space/tasks */
router.get('/tasks', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  try {
    const tasks = await tenantQuery(
      m.tenantId,
      `SELECT t.id, t.title, t.description, t.priority, t.status, t.due_date,
              t.category, t.elapsed_seconds, t.is_request, t.request_price,
              t.project_id, p.nom AS project_name,
              t.created_at, t.completed_at
         FROM public.team_member_tasks t
         LEFT JOIN public.projets p ON p.id = t.project_id
         WHERE t.team_member_id = $1
            OR t.assigned_stagiaire_id IN (
                 SELECT id FROM public.stagiaires WHERE member_id = $1)
         ORDER BY (t.status = 'done'), (t.status = 'cancelled'), t.due_date NULLS LAST, t.created_at ASC`,
      [m.id],
    )
    res.json(tasks)
  } catch (err: any) {
    logger.error('[my-space:tasks]', err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PATCH /api/my-space/tasks/:id — member can update status + elapsed_seconds */
/**
 * POST /api/my-space/tasks — un membre ajoute une tâche à SA liste.
 *
 * La tâche est forcément la sienne : team_member_id vient de la session,
 * jamais du corps de la requête. Un membre ne peut donc pas se servir de
 * cet endpoint pour assigner du travail à quelqu'un d'autre.
 *
 * Le projet, s'il est fourni, doit être un projet sur lequel la personne
 * travaille — sinon elle découvrirait l'existence de projets qui ne la
 * concernent pas en tâtonnant sur des identifiants.
 */
router.post('/tasks', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const title = String(req.body?.title ?? '').trim()
  if (title.length < 2)   return res.status(400).json({ error: 'Titre trop court' })
  if (title.length > 200) return res.status(400).json({ error: 'Titre trop long (200 caractères max)' })

  const description = req.body?.description == null ? null : String(req.body.description).trim().slice(0, 4000)

  const priority = String(req.body?.priority ?? 'normal')
  if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
    return res.status(400).json({ error: 'Priorité invalide' })
  }

  /* Date seule (YYYY-MM-DD) : la colonne est de type date. */
  const rawDue = req.body?.due_date
  const dueDate = typeof rawDue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null

  const projectId = typeof req.body?.project_id === 'string' && UUID_RE.test(req.body.project_id)
    ? req.body.project_id
    : null

  try {
    if (projectId) {
      const allowed = await tenantQueryOne(
        m.tenantId,
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
        [m.id, projectId],
      )
      if (!allowed) return res.status(403).json({ error: "Ce projet ne vous est pas assigné" })
    }

    const task = await tenantQueryOne<{ id: string }>(
      m.tenantId,
      `INSERT INTO public.team_member_tasks
         (tenant_id, team_member_id, title, description, priority, status, due_date, project_id)
       VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7)
       RETURNING id, title, description, priority, status, due_date, project_id, created_at`,
      [m.tenantId, m.id, title, description, priority, dueDate, projectId],
    )

    res.status(201).json(task)

    /* Après la réponse : prévenir les responsables. */
    void notifyAdminsOfNewTask(m.tenantId, m.id, {
      id: (task as any).id, title, priority, dueDate, projectId,
    })
  } catch (err: any) {
    logger.error('[my-space:task-create]', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * Prévient les comptes admin / manager de l'espace qu'un membre a créé
 * une tâche : cloche, notification navigateur, et e-mail si la catégorie
 * `tache_creee` est restée active dans les réglages (migration 096).
 */
async function notifyAdminsOfNewTask(
  tenantId: string,
  memberId: string,
  task: { id: string; title: string; priority: string; dueDate: string | null; projectId: string | null },
) {
  try {
    const me = await tenantQueryOne<{ prenom: string | null; nom: string | null; email: string }>(
      tenantId, `SELECT prenom, nom, email FROM public.team_members WHERE id = $1`, [memberId],
    )
    const auteur = [me?.prenom, me?.nom].filter(Boolean).join(' ').trim() || me?.email || 'Un membre'

    const projet = task.projectId
      ? await tenantQueryOne<{ nom: string }>(tenantId, `SELECT nom FROM public.projets WHERE id = $1`, [task.projectId])
      : null

    const admins = await tenantQuery<{ user_id: string }>(
      tenantId,
      `SELECT user_id FROM public.tenant_users
        WHERE tenant_id = $1 AND status = 'active' AND role IN ('admin', 'manager')`,
      [tenantId],
    )

    const detail = [
      projet?.nom ? `Projet : ${projet.nom}` : null,
      task.dueDate ? `Échéance : ${task.dueDate}` : null,
    ].filter(Boolean).join(' · ')

    for (const a of admins) {
      await tenantQuery(
        tenantId,
        `INSERT INTO public.notifications
           (tenant_id, user_id, kind, severity, title, message, link, icon, data)
         VALUES ($1, $2, 'member_task_created', 'info', $3, $4, '/taches', '✅', $5::jsonb)`,
        [
          tenantId, a.user_id,
          `${auteur} a ajouté une tâche`,
          detail ? `${task.title} — ${detail}` : task.title,
          JSON.stringify({ task_id: task.id, member_id: memberId }),
        ],
      ).catch(e => logger.error('[my-space:task-notif-row]', e.message))

      sendPushToUser(tenantId, a.user_id, {
        title: `✅ ${auteur} a ajouté une tâche`,
        body:  task.title,
        url:   '/taches',
        tag:   'member-task-created',
      }).catch(() => {})
    }

    void notifyMemberTaskCreated(tenantId, {
      titre:     task.title,
      membre:    auteur,
      priorite:  task.priority,
      echeance:  task.dueDate,
      projetNom: projet?.nom ?? null,
    }).catch(() => {})
  } catch (e: any) {
    logger.error('[my-space:task-notify]', e.message)
  }
}

/**
 * POST /api/my-space/tasks/:id/viewed — la personne a ouvert la tâche.
 *
 * Écrit uniquement à la première consultation (COALESCE) : c'est le
 * moment « ✓✓ », pas un compteur de passages. Idempotent, donc le client
 * peut l'appeler à chaque ouverture sans précaution.
 *
 * La tâche doit être la sienne — directement ou via sa fiche stagiaire.
 * Sans ce filtre, un membre pourrait marquer comme lue la tâche d'un
 * collègue et fausser ce que voit le responsable.
 */
router.post('/tasks/:id/viewed', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const name = await tenantQueryOne<{ prenom: string | null; nom: string | null; email: string }>(
      m.tenantId, `SELECT prenom, nom, email FROM public.team_members WHERE id = $1`, [m.id],
    )
    const who = [name?.prenom, name?.nom].filter(Boolean).join(' ').trim() || name?.email || 'Membre'

    const row = await tenantQueryOne<{ viewed_at: string }>(
      m.tenantId,
      `UPDATE public.team_member_tasks
          SET viewed_at      = COALESCE(viewed_at, NOW()),
              viewed_by_name = COALESCE(viewed_by_name, $3)
        WHERE id = $1
          AND (team_member_id = $2
               OR assigned_stagiaire_id IN (
                    SELECT id FROM public.stagiaires WHERE member_id = $2))
        RETURNING viewed_at, viewed_by_name`,
      [id, m.id, who],
    )
    if (!row) return res.status(404).json({ error: 'Tâche introuvable' })
    res.json(row)
  } catch (err: any) {
    logger.error('[my-space:task-viewed]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/tasks/:id', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  const status = req.body.status
  /* Allow 'validation' — member's "Terminer" → status goes to validation,
     the manager then validates from his side. */
  if (status !== undefined && !['todo','in_progress','validation','done'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' })
  }

  /* Optional elapsed_seconds patch (timer Pause/Stop saves it) */
  const elapsed = req.body.elapsed_seconds
  const hasElapsed = typeof elapsed === 'number' && elapsed >= 0
  const hasStatus  = status !== undefined
  /* Optional description (member can add details, subtasks, comments via dialog) */
  const description = req.body.description
  const hasDesc = typeof description === 'string'

  if (!hasStatus && !hasElapsed && !hasDesc) {
    return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  }

  try {
    /* Agir sur une tâche prouve qu'on l'a vue : démarrer le chrono ou la
       terminer vaut consultation, même sans avoir ouvert la fiche.
       COALESCE garde la première date. */
    const sets: string[] = [
      'updated_at = NOW()',
      'viewed_at = COALESCE(viewed_at, NOW())',
      /* Le nom est résolu en SQL : pas de requête supplémentaire juste
         pour estampiller un accusé de lecture. */
      `viewed_by_name = COALESCE(viewed_by_name, (
         SELECT COALESCE(NULLIF(TRIM(COALESCE(prenom, '') || ' ' || COALESCE(nom, '')), ''), email)
           FROM public.team_members WHERE id = $1))`,
    ]
    const params: any[] = [m.id]
    let i = 2
    if (hasStatus) {
      sets.push(`status = $${i++}`)
      params.push(status)
      sets.push(`completed_at = CASE WHEN $${i - 1} = 'done' THEN NOW() ELSE completed_at END`)
    }
    if (hasElapsed) {
      sets.push(`elapsed_seconds = $${i++}`)
      params.push(elapsed)
    }
    if (hasDesc) {
      sets.push(`description = $${i++}`)
      params.push(description)
    }
    params.push(id, m.id)
    const row = await tenantQueryOne(
      m.tenantId,
      `UPDATE public.team_member_tasks SET ${sets.join(', ')}
        WHERE id = $${i++}
          AND (team_member_id = $${i}
               OR assigned_stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $${i}))
        RETURNING id, title`,
      params,
    )
    if (!row) return res.status(404).json({ error: 'Tâche introuvable' })
    if (hasStatus) {
      await logActivity(
        m.tenantId, m.id,
        status === 'done' ? 'task_completed' : 'task_updated',
        { taskId: id, title: (row as any).title, status },
      )
    }
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[my-space:task-patch]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── SOPs ─────────────────────────────────────────────────────────
   Un membre voit les catégories qui lui sont accordées dans
   team_member_sop_access. Le niveau 'edit' — « Édition (formateur) »
   dans /equipe — l'autorise en plus à créer et modifier les SOPs de
   CETTE catégorie. 'read' et 'complete' restent en lecture seule.

   Toute écriture estampille sops.created_by_name / updated_by_name
   avec le nom du membre : c'est ce nom, et lui seul, qui s'affiche
   ensuite dans /my-space/sops et dans /sop côté admin. ── */

/** Catégories accordées au membre, et sous-ensemble éditable. */
async function sopAccess(tenantId: string, memberId: string): Promise<{
  categories: string[]
  editable:   Set<string>
}> {
  const rows = await tenantQuery<{ sop_category: string; access_level: string }>(
    tenantId,
    `SELECT sop_category, access_level FROM public.team_member_sop_access WHERE team_member_id = $1`,
    [memberId],
  )
  return {
    categories: rows.map(r => r.sop_category),
    editable:   new Set(rows.filter(r => r.access_level === 'edit').map(r => r.sop_category)),
  }
}

/** Nom affichable du membre — « Prénom NOM », repli sur l'email. */
async function memberDisplayName(tenantId: string, memberId: string): Promise<string> {
  const me = await tenantQueryOne<{ prenom: string | null; nom: string | null; email: string }>(
    tenantId,
    `SELECT prenom, nom, email FROM public.team_members WHERE id = $1`,
    [memberId],
  )
  if (!me) return 'Membre'
  return [me.prenom, me.nom].filter(Boolean).join(' ').trim() || me.email
}

const SOP_SELECT = `id, slug, title, description, category, tags, author, author_bg, read_min,
                    views, popular, blocks, created_by_name, updated_by_name, created_at, updated_at`

/**
 * Valide et normalise le corps d'une SOP envoyée par un membre.
 * Renvoie une chaîne d'erreur, ou l'objet nettoyé.
 *
 * On borne explicitement blocks : le body parser accepte 12 Mo, ce qui
 * suffirait à stocker une SOP illisible (et à faire ramer la liste,
 * qui renvoie tous les blocks). 400 blocs couvrent très largement la
 * plus longue SOP du catalogue (≈ 150 blocs).
 */
function parseSopBody(body: any): { error: string } | {
  title: string; description: string | null; category: string
  tags: string[]; read_min: number; blocks: any[]
} {
  const title = String(body?.title ?? '').trim()
  if (title.length < 3)   return { error: 'Titre trop court (3 caractères minimum)' }
  if (title.length > 200) return { error: 'Titre trop long (200 caractères maximum)' }

  const category = String(body?.category ?? '').trim()
  if (!category) return { error: 'Catégorie manquante' }

  const rawDesc = body?.description == null ? '' : String(body.description).trim()
  if (rawDesc.length > 500) return { error: 'Description trop longue (500 caractères maximum)' }

  if (body?.tags != null && !Array.isArray(body.tags)) return { error: 'tags invalide' }
  const tags = (Array.isArray(body?.tags) ? body.tags : [])
    .map((t: unknown) => String(t).trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((t: string) => t.slice(0, 40))

  const readMin = Number(body?.read_min)
  const read_min = Number.isFinite(readMin) ? Math.min(120, Math.max(1, Math.round(readMin))) : 2

  if (!Array.isArray(body?.blocks)) return { error: 'blocks doit être un tableau' }
  if (body.blocks.length > 400)     return { error: 'SOP trop longue (400 blocs maximum)' }
  if (JSON.stringify(body.blocks).length > 400_000) {
    return { error: 'SOP trop volumineuse (400 Ko maximum)' }
  }

  return { title, description: rawDesc || null, category, tags, read_min, blocks: body.blocks }
}

/** Slug stable dérivé du titre, suffixé tant qu'il est pris dans le tenant. */
async function uniqueSopSlug(tenantId: string, title: string, excludeId?: string): Promise<string> {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sop'

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const taken = await tenantQueryOne(
      tenantId,
      `SELECT 1 FROM public.sops WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1`,
      [candidate, excludeId ?? null],
    )
    if (!taken) return candidate
  }
  return `${base}-${excludeId ?? 'x'}`.slice(0, 80)
}

/* GET /api/my-space/sops — strictly filtered by access list */
router.get('/sops', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  try {
    const { categories, editable } = await sopAccess(m.tenantId, m.id)
    if (!categories.length) return res.json([])

    const filterByCat = typeof req.query.category === 'string' ? req.query.category : null
    if (filterByCat && !categories.includes(filterByCat)) {
      return res.status(403).json({ error: 'Catégorie non autorisée' })
    }

    const cats = filterByCat ? [filterByCat] : categories
    const sops = await tenantQuery<{ category: string }>(
      m.tenantId,
      `SELECT ${SOP_SELECT}
         FROM public.sops WHERE category = ANY($1::text[])
         ORDER BY popular DESC, created_at DESC`,
      [cats],
    )
    res.json(sops.map(s => ({ ...s, can_edit: editable.has(s.category) })))
  } catch (err: any) {
    logger.error('[my-space:sops]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /api/my-space/sops/editable-categories — where I may add/edit */
router.get('/sops/editable-categories', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  try {
    const { editable } = await sopAccess(m.tenantId, m.id)
    res.json(Array.from(editable))
  } catch (err: any) {
    logger.error('[my-space:sop-editable]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/my-space/sops — create a SOP in a category I may edit */
router.post('/sops', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const parsed = parseSopBody(req.body)
  if ('error' in parsed) return res.status(400).json({ error: parsed.error })

  try {
    const { editable } = await sopAccess(m.tenantId, m.id)
    if (!editable.has(parsed.category)) {
      return res.status(403).json({ error: "Vous n'avez pas le droit d'ajouter une SOP dans cette catégorie" })
    }

    const author = await memberDisplayName(m.tenantId, m.id)
    const slug   = await uniqueSopSlug(m.tenantId, parsed.title)

    const created = await tenantQueryOne(
      m.tenantId,
      `INSERT INTO public.sops
         (tenant_id, slug, title, description, category, tags, author, read_min, blocks,
          created_by_name, updated_by_name)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $7, $7)
       RETURNING ${SOP_SELECT}`,
      [m.tenantId, slug, parsed.title, parsed.description, parsed.category,
       JSON.stringify(parsed.tags), author, parsed.read_min, JSON.stringify(parsed.blocks)],
    )

    await logActivity(
      m.tenantId, m.id, 'sop_created',
      { sop_id: (created as any)?.id, sop_title: parsed.title, category: parsed.category },
      req.ip, req.headers['user-agent'] as string,
    )

    res.status(201).json({ ...(created as any), can_edit: true })
  } catch (err: any) {
    logger.error('[my-space:sop-create]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PUT /api/my-space/sops/:id — update a SOP I may edit */
router.put('/sops/:id', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  /* String() : req.params est typé string | string[] dans cette version
     d'Express — le reste du fichier laisse passer, on ne l'aggrave pas. */
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  const parsed = parseSopBody(req.body)
  if ('error' in parsed) return res.status(400).json({ error: parsed.error })

  try {
    const existing = await tenantQueryOne<{ category: string; title: string }>(
      m.tenantId,
      `SELECT category, title FROM public.sops WHERE id = $1`, [id],
    )
    if (!existing) return res.status(404).json({ error: 'SOP introuvable' })

    /* Il faut le droit d'édition sur la catégorie de départ ET sur celle
       d'arrivée : sans quoi on déplacerait une SOP hors de son périmètre,
       ou on en ferait entrer une qu'on n'a pas le droit de toucher. */
    const { editable } = await sopAccess(m.tenantId, m.id)
    if (!editable.has(existing.category)) {
      return res.status(403).json({ error: "Vous n'avez pas le droit de modifier cette SOP" })
    }
    if (!editable.has(parsed.category)) {
      return res.status(403).json({ error: "Vous n'avez pas le droit de déplacer cette SOP dans cette catégorie" })
    }

    const editor = await memberDisplayName(m.tenantId, m.id)
    const slug   = await uniqueSopSlug(m.tenantId, parsed.title, id)

    const updated = await tenantQueryOne(
      m.tenantId,
      `UPDATE public.sops
          SET title = $2, description = $3, category = $4, tags = $5::jsonb,
              read_min = $6, blocks = $7::jsonb, slug = $8,
              updated_by_name = $9, updated_at = now()
        WHERE id = $1
        RETURNING ${SOP_SELECT}`,
      [id, parsed.title, parsed.description, parsed.category, JSON.stringify(parsed.tags),
       parsed.read_min, JSON.stringify(parsed.blocks), slug, editor],
    )

    await logActivity(
      m.tenantId, m.id, 'sop_updated',
      { sop_id: id, sop_title: parsed.title, category: parsed.category, previous_title: existing.title },
      req.ip, req.headers['user-agent'] as string,
    )

    res.json({ ...(updated as any), can_edit: true })
  } catch (err: any) {
    logger.error('[my-space:sop-update]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /api/my-space/sops/:id — single SOP (must be in member's accessible category) */
router.get('/sops/:id', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const sop = await tenantQueryOne<{ category: string }>(
      m.tenantId,
      `SELECT * FROM public.sops WHERE id = $1`, [id],
    )
    if (!sop) return res.status(404).json({ error: 'SOP introuvable' })

    const allowed = await tenantQueryOne<{ access_level: string }>(
      m.tenantId,
      `SELECT access_level FROM public.team_member_sop_access
        WHERE team_member_id = $1 AND sop_category = $2 LIMIT 1`,
      [m.id, sop.category],
    )
    if (!allowed) return res.status(403).json({ error: 'Accès non autorisé à cette SOP' })

    /* Increment views (best-effort) */
    tenantQuery(m.tenantId, `UPDATE public.sops SET views = views + 1 WHERE id = $1`, [id]).catch(() => {})

    res.json({ ...sop, can_edit: allowed.access_level === 'edit' })
  } catch (err: any) {
    logger.error('[my-space:sop-get]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/my-space/sops/activity — log a sop_viewed or checklist event */
router.post('/sops/activity', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const { sop_id, action_type, details } = req.body
  if (!sop_id || !UUID_RE.test(sop_id)) return res.status(400).json({ error: 'sop_id invalide' })
  const validTypes = new Set(['sop_viewed','sop_checklist_completed','sop_marked_read','sop_note_added'])
  if (!validTypes.has(action_type)) return res.status(400).json({ error: 'action_type invalide' })

  try {
    /* Verify member has access to this SOP's category */
    const sop = await tenantQueryOne<{ category: string; title: string }>(
      m.tenantId,
      `SELECT category, title FROM public.sops WHERE id = $1`, [sop_id],
    )
    if (!sop) return res.status(404).json({ error: 'SOP introuvable' })
    const ok = await tenantQueryOne(
      m.tenantId,
      `SELECT 1 FROM public.team_member_sop_access WHERE team_member_id = $1 AND sop_category = $2 LIMIT 1`,
      [m.id, sop.category],
    )
    if (!ok) return res.status(403).json({ error: 'Accès non autorisé' })

    await logActivity(
      m.tenantId, m.id, action_type,
      { sop_id, sop_title: sop.title, category: sop.category, ...(typeof details === 'object' && details ? details : {}) },
      req.ip, req.headers['user-agent'] as string,
    )
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[my-space:sop-activity]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/my-space/projets — projects this member is assigned to,
   OR has at least one task on (direct or via linked stagiaire).

   L'assignation compte sous ses DEUX formes : ligne projet_assignees
   portant team_member_id, ou portant stagiaire_id d'un stagiaire
   rattaché à ce membre (migration 063 : les deux ids sont exclusifs sur
   une même ligne). Ne tester que team_member_id masquait les projets où
   la personne figure via sa fiche stagiaire — d'où des projets manquants
   dans « Mes projets ». ── */
router.get('/projets', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  try {
    const rows = await tenantQuery(
      m.tenantId,
      `SELECT p.id, p.nom, p.description, p.statut, p.priorite,
              p.date_debut, p.date_fin_prevue, p.date_fin_reelle,
              p.budget, p.progression,
              p.client_id, c.nom AS client_nom, c.entreprise AS client_entreprise,
              /* Même règle d'élection que GET /projets/:id : la ligne membre
                 prime sur la fiche stagiaire, et rôle et périmètre viennent
                 de LA MÊME ligne — deux sous-requêtes triées différemment
                 pourraient sinon décrire deux assignations distinctes. */
              (SELECT pa.role FROM public.projet_assignees pa
                WHERE pa.projet_id = p.id
                  AND (pa.team_member_id = $1
                       OR pa.stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1))
                ORDER BY (pa.team_member_id IS NOT NULL) DESC, pa.created_at ASC
                LIMIT 1) AS my_role,
              COALESCE((SELECT pa.task_access FROM public.projet_assignees pa
                WHERE pa.projet_id = p.id
                  AND (pa.team_member_id = $1
                       OR pa.stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1))
                ORDER BY (pa.team_member_id IS NOT NULL) DESC, pa.created_at ASC
                LIMIT 1), 'assigned') AS task_access,
              (SELECT COUNT(*)::int FROM public.team_member_tasks t
                WHERE t.project_id = p.id
                  AND (t.team_member_id = $1
                       OR t.assigned_stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1))) AS my_tasks_count,
              (SELECT COUNT(*)::int FROM public.team_member_tasks t
                WHERE t.project_id = p.id AND t.status = 'done'
                  AND (t.team_member_id = $1
                       OR t.assigned_stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1))) AS my_tasks_done,
              (SELECT COUNT(*)::int FROM public.team_member_tasks t
                WHERE t.project_id = p.id) AS project_tasks_count,
              (SELECT COUNT(*)::int FROM public.team_member_tasks t
                WHERE t.project_id = p.id AND t.status = 'done') AS project_tasks_done
         FROM public.projets p
         LEFT JOIN public.clients c ON c.id = p.client_id
        WHERE EXISTS (
                SELECT 1 FROM public.projet_assignees pa
                 WHERE pa.projet_id = p.id
                   AND (pa.team_member_id = $1
                        OR pa.stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1)))
           OR EXISTS (
                SELECT 1 FROM public.team_member_tasks t
                 WHERE t.project_id = p.id
                   AND (t.team_member_id = $1
                        OR t.assigned_stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1)))
        ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC`,
      [m.id],
    )
    res.json(rows)
  } catch (err: any) {
    logger.error('[my-space:projets]', err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/my-space/projets/:id — single project (only if assigned) ── */
router.get('/projets/:id', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    /* Check assignment first + récupère share_infos et task_access.
       L'assignation vaut sous ses deux formes (membre ou stagiaire lié).
       Fallback : accès via tâche (direct ou stagiaire lié) en mode restreint. */
    let assigned = await tenantQueryOne<{ role: string; share_infos: boolean; task_access: string }>(
      m.tenantId,
      `SELECT pa.role,
              COALESCE(pa.share_infos, TRUE)      AS share_infos,
              COALESCE(pa.task_access, 'assigned') AS task_access
         FROM public.projet_assignees pa
        WHERE pa.projet_id = $2
          AND (pa.team_member_id = $1
               OR pa.stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1))
        /* UNE ligne gouverne la personne, et les trois axes en viennent
           ensemble. Trier par permissivité les mélangerait : un share_infos
           coupé sur la ligne membre serait rétabli par la ligne stagiaire.
           La ligne membre prime — c'était la seule lue avant ce changement,
           donc rien ne bouge pour les assignations existantes ; la fiche
           stagiaire ne sert que si la personne n'a pas de ligne membre. */
        ORDER BY (pa.team_member_id IS NOT NULL) DESC, pa.created_at ASC
        LIMIT 1`,
      [m.id, id],
    )
    if (!assigned) {
      const hasTask = await tenantQueryOne(
        m.tenantId,
        `SELECT 1 FROM public.team_member_tasks
          WHERE project_id = $2
            AND (team_member_id = $1
                 OR assigned_stagiaire_id IN (SELECT id FROM public.stagiaires WHERE member_id = $1))
          LIMIT 1`,
        [m.id, id],
      )
      if (!hasTask) return res.status(403).json({ error: 'Tu n\'es pas assigné à ce projet' })
      /* Accès dérivé d'une tâche, sans ligne d'assignation : mode le plus
         restreint des deux axes — ni infos sensibles, ni tâches des autres. */
      assigned = { role: 'member', share_infos: false, task_access: 'assigned' }
    }
    const shareInfos = assigned.share_infos !== false
    const seesAllTasks = assigned.task_access === 'all'

    let projet: any
    if (shareInfos) {
      projet = await tenantQueryOne(
        m.tenantId,
        `SELECT p.*, c.nom AS client_nom, c.entreprise AS client_entreprise,
                c.email AS client_email, c.telephone AS client_telephone,
                c.adresse AS client_adresse, c.ville AS client_ville, c.pays AS client_pays
           FROM public.projets p
           LEFT JOIN public.clients c ON c.id = p.client_id
          WHERE p.id = $1`,
        [id],
      )
    } else {
      /* Mode restreint : pas d'infos client ni de notes/credentials */
      projet = await tenantQueryOne(
        m.tenantId,
        `SELECT id, tenant_id, nom, description, statut, priorite,
                date_debut, date_fin_prevue, date_fin_reelle,
                progression, created_at, updated_at,
                NULL::text AS notes,
                NULL::text AS client_nom, NULL::text AS client_entreprise,
                NULL::text AS client_email, NULL::text AS client_telephone,
                NULL::text AS client_adresse, NULL::text AS client_ville, NULL::text AS client_pays
           FROM public.projets WHERE id = $1`,
        [id],
      )
    }
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' })

    /* Tâches du projet, filtrées par task_access.

       'assigned' : seules les siennes quittent le serveur. Le filtre n'est
       pas cosmétique — renvoyer la liste complète en la masquant côté React
       la laisserait lisible dans la réponse réseau.
       'all' : tout le projet, avec is_mine pour distinguer ce sur quoi la
       personne peut agir. L'écriture reste verrouillée par le PATCH
       /api/my-space/tasks/:id, qui exige team_member_id (ou stagiaire lié). */
    const taskCols = `t.id, t.title, t.status, t.priority, t.due_date, t.category,
                      t.elapsed_seconds, t.is_request, t.project_id,
                      t.created_at, t.completed_at`
    const isMineExpr = `((t.team_member_id IS NOT NULL AND t.team_member_id = $2)
                         OR EXISTS (SELECT 1 FROM public.stagiaires s
                                     WHERE s.id = t.assigned_stagiaire_id AND s.member_id = $2))`
    /* `description` porte l'enveloppe JSON de la tâche : checklist, pièces
       jointes, blocs SOP et le fil de commentaires membre ↔ manager. La fiche
       détaillée en a besoin — mais UNIQUEMENT pour les tâches du membre.
       En mode 'all' la requête n'a pas de filtre is_mine : sortir ces colonnes
       de la liste partagée publierait le fil privé et le prix facturé des
       demandes de tous les coéquipiers. */
    const privateCols = `CASE WHEN ${isMineExpr} THEN t.description END AS description,
                         CASE WHEN ${isMineExpr} THEN t.request_price END AS request_price`
    const myTasks = seesAllTasks
      ? await tenantQuery(
          m.tenantId,
          `SELECT ${taskCols}, ${privateCols},
                  ${isMineExpr} AS is_mine,
                  COALESCE(
                    NULLIF(TRIM(CONCAT_WS(' ', tm.prenom, tm.nom)), ''),
                    st.nom_complet,
                    CASE WHEN t.assigned_user_id IS NOT NULL THEN 'Admin' END
                  ) AS assignee_name
             FROM public.team_member_tasks t
             LEFT JOIN public.team_members tm ON tm.id = t.team_member_id
             LEFT JOIN public.stagiaires   st ON st.id = t.assigned_stagiaire_id
            WHERE t.project_id = $1
            ORDER BY ${isMineExpr} DESC, (t.status = 'done'), t.due_date NULLS LAST, t.created_at ASC`,
          [id, m.id],
        )
      : await tenantQuery(
          m.tenantId,
          `SELECT ${taskCols}, ${privateCols}, TRUE AS is_mine, NULL::text AS assignee_name
             FROM public.team_member_tasks t
            WHERE t.project_id = $1
              AND ${isMineExpr}
            ORDER BY (t.status = 'done'), t.due_date NULLS LAST, t.created_at ASC`,
          [id, m.id],
        )

    /* `teammates` reste vide : la composition de l'équipe n'est jamais
       exposée en bloc à l'espace membre. En mode 'all', assignee_name
       nomme malgré tout le porteur de chaque tâche — c'est indissociable
       de « consulter toutes les tâches et suivre leur avancement », et
       c'est un accès que l'admin accorde personne par personne. */
    res.json({
      ...projet,
      my_role:     (assigned as any).role,
      share_infos: shareInfos,
      task_access: seesAllTasks ? 'all' : 'assigned',
      my_tasks:    myTasks,
      teammates:   [],
    })
  } catch (err: any) {
    logger.error('[my-space:projet-detail]', err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/my-space/projets/:id/messages — chat du projet ── */
router.get('/projets/:id/messages', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    /* Verify assignment */
    const assigned = await tenantQueryOne(
      m.tenantId,
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
      [m.id, id],
    )
    if (!assigned) return res.status(403).json({ error: 'Tu n\'es pas assigné à ce projet' })

    const rows = await tenantQuery(
      m.tenantId,
      `SELECT id, projet_id, author_user_id, author_team_member_id, author_name, is_admin, text, created_at
         FROM public.projet_messages WHERE projet_id = $1 ORDER BY created_at ASC`,
      [id],
    )
    res.json(rows)
  } catch (err: any) {
    logger.error('[my-space:projet-messages]', err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/my-space/projets/:id/messages — poster un message ── */
router.post('/projets/:id/messages', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  const text = String(req.body?.text ?? '').trim()
  if (!text) return res.status(400).json({ error: 'Message vide' })
  if (text.length > 4000) return res.status(400).json({ error: 'Message trop long (4000 max)' })

  try {
    const assigned = await tenantQueryOne(
      m.tenantId,
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
      [m.id, id],
    )
    if (!assigned) return res.status(403).json({ error: 'Tu n\'es pas assigné à ce projet' })

    const me = await tenantQueryOne<{ prenom: string; nom: string }>(
      m.tenantId,
      `SELECT prenom, nom FROM public.team_members WHERE id = $1`,
      [m.id],
    )
    const authorName = me ? `${me.prenom ?? ''} ${me.nom ?? ''}`.trim() || 'Membre' : 'Membre'

    const row = await tenantQueryOne(
      m.tenantId,
      `INSERT INTO public.projet_messages
         (tenant_id, projet_id, author_team_member_id, author_name, is_admin, text)
         VALUES ($1, $2, $3, $4, FALSE, $5) RETURNING *`,
      [m.tenantId, id, m.id, authorName, text],
    )
    res.status(201).json(row)
  } catch (err: any) {
    logger.error('[my-space:post-message]', err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
