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
    const sets: string[] = ['updated_at = NOW()']
    const params: any[] = []
    let i = 1
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

/* GET /api/my-space/sops — strictly filtered by access list */
router.get('/sops', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  try {
    const access = await tenantQuery<{ sop_category: string }>(
      m.tenantId,
      `SELECT sop_category FROM public.team_member_sop_access WHERE team_member_id = $1`, [m.id],
    )
    const categories = access.map(a => a.sop_category)
    if (!categories.length) return res.json([])

    const filterByCat = typeof req.query.category === 'string' ? req.query.category : null
    if (filterByCat && !categories.includes(filterByCat)) {
      return res.status(403).json({ error: 'Catégorie non autorisée' })
    }

    const cats = filterByCat ? [filterByCat] : categories
    const sops = await tenantQuery(
      m.tenantId,
      `SELECT id, slug, title, description, category, tags, author, author_bg, read_min,
              views, popular, blocks, created_at, updated_at
         FROM public.sops WHERE category = ANY($1::text[])
         ORDER BY popular DESC, created_at DESC`,
      [cats],
    )
    res.json(sops)
  } catch (err: any) {
    logger.error('[my-space:sops]', err.message)
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

    const allowed = await tenantQueryOne(
      m.tenantId,
      `SELECT 1 FROM public.team_member_sop_access
        WHERE team_member_id = $1 AND sop_category = $2 LIMIT 1`,
      [m.id, sop.category],
    )
    if (!allowed) return res.status(403).json({ error: 'Accès non autorisé à cette SOP' })

    /* Increment views (best-effort) */
    tenantQuery(m.tenantId, `UPDATE public.sops SET views = views + 1 WHERE id = $1`, [id]).catch(() => {})

    res.json(sop)
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
                      t.elapsed_seconds, t.is_request`
    const isMineExpr = `((t.team_member_id IS NOT NULL AND t.team_member_id = $2)
                         OR EXISTS (SELECT 1 FROM public.stagiaires s
                                     WHERE s.id = t.assigned_stagiaire_id AND s.member_id = $2))`
    const myTasks = seesAllTasks
      ? await tenantQuery(
          m.tenantId,
          `SELECT ${taskCols},
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
          `SELECT ${taskCols}, TRUE AS is_mine, NULL::text AS assignee_name
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
