/**
 * Service des images de SOP — /api/sop-images/:id
 *
 * Monté à part parce que les DEUX espaces en ont besoin : l'espace
 * membre qui les téléverse, et l'espace admin (/sop, mode formation,
 * lecteur de tâches) qui doit pouvoir afficher un SOP écrit par un
 * membre. Une route réservée à /api/my-space aurait laissé des images
 * cassées partout ailleurs.
 *
 * Le téléversement, la légende et la suppression restent côté membre
 * (server/routes/mySpaceSops.ts) : ce sont des actions d'écriture,
 * gouvernées par team_member_sop_access.
 */
import { Router, type Request, type Response } from 'express'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { logger } from '../lib/logger'

const router = Router()
router.use(requireAuth)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.NODE_ENV === 'production' ? '/app/uploads' : path.resolve(process.cwd(), 'uploads'))

/**
 * GET /:id — servir une image.
 *
 * Règles d'accès, dans l'ordre :
 *   - compte admin        → tout SOP de son espace (la RLS borne déjà) ;
 *   - membre + SOP        → il faut la catégorie dans ses accès ;
 *   - membre + orpheline  → seul son téléverseur, sinon un identifiant
 *                           deviné donnerait accès au brouillon d'autrui.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Image invalide' })

  const tenantId = req.user!.tenantId
  const isMember = req.user!.role === 'team_member'

  try {
    const img = await tenantQueryOne<{
      sop_id: string | null; filename: string; mime: string
      storage_path: string; size_bytes: string; uploader_member_id: string | null
    }>(
      tenantId,
      `SELECT sop_id, filename, mime, storage_path, size_bytes, uploader_member_id
         FROM public.sop_images WHERE id = $1`,
      [id],
    )
    if (!img) return res.status(404).json({ error: 'Image introuvable' })

    if (isMember) {
      const me = await tenantQueryOne<{ id: string; account_status: string }>(
        tenantId,
        `SELECT id, account_status FROM public.team_members
          WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
        [req.user!.userId, tenantId],
      )
      if (!me || me.account_status !== 'active') return res.status(403).json({ error: 'Compte inactif' })

      if (img.sop_id) {
        const ok = await tenantQueryOne(
          tenantId,
          `SELECT 1 FROM public.sops s
             JOIN public.team_member_sop_access a
               ON a.sop_category = s.category AND a.team_member_id = $2
            WHERE s.id = $1 LIMIT 1`,
          [img.sop_id, me.id],
        )
        if (!ok) return res.status(403).json({ error: 'Accès refusé' })
      } else if (img.uploader_member_id !== me.id) {
        return res.status(403).json({ error: 'Accès refusé' })
      }
    }

    const absPath = path.join(UPLOAD_DIR, img.storage_path)
    if (!absPath.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
      return res.status(400).json({ error: 'Chemin invalide' })
    }

    res.setHeader('Content-Type', img.mime)
    res.setHeader('Content-Length', img.size_bytes)
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(img.filename)}`)
    res.setHeader('Cache-Control', 'private, max-age=86400')

    const stream = createReadStream(absPath)
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'Fichier absent du stockage' })
      else res.end()
    })
    stream.pipe(res)
  } catch (err: any) {
    logger.error('[sop-images:get]', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
