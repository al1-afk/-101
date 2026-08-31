/**
 * GET /api/activity — journal d'activité unifié pour l'admin.
 *
 * Fusionne :
 *  - activity_logs         (modifications CRUD : factures, paiements, dépenses, contrats, clients…)
 *  - team_member_activity  (actions des membres : login, task_completed, sop_viewed…)
 *  - security_audit_log    (émissions de tokens invit/reset)
 *
 * Renvoie une liste chronologique unifiée pour l'onglet ANALYSE > Journal d'activité.
 */
import { Router, Request, Response } from 'express'
import { tenantQuery } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { requireSecurityMonitoring } from '../middleware/securityMonitor'
import { logger } from '../lib/logger'

const router = Router()

/* Journal réservé aux administrateurs (ou aux comptes portant
   SECURITY_MONITORING_READ), comme le reste du Centre de sécurité.

   Il n'était protégé que par `requireAuth` : n'importe quel compte
   authentifié de l'espace — un viewer, un commercial — pouvait lire
   l'activité de tous les autres, les IP des administrateurs et les
   préfixes de jetons d'invitation et de réinitialisation émis
   (security_audit_log.token_prefix). Un journal d'audit lisible par
   ceux qu'il surveille ne remplit pas son office. */
router.get('/', requireAuth, requireSecurityMonitoring, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const limit = Math.min(Number(req.query.limit ?? 500), 2000)
  try {
    const [logs, memberActs, securityActs] = await Promise.all([
      tenantQuery(
        tenantId,
        `SELECT al.id, al.module_name, al.record_id, al.action_type, al.description,
                al.created_at,
                COALESCE(u.name, u.email, 'Utilisateur') AS actor_name,
                u.email AS actor_email
           FROM public.activity_logs al
           LEFT JOIN public.users u ON u.id = al.user_id
          ORDER BY al.created_at DESC
          LIMIT $1`,
        [limit],
      ),
      tenantQuery(
        tenantId,
        `SELECT tma.id, tma.action_type, tma.action_details, tma.created_at, tma.ip_address,
                COALESCE(tm.prenom || ' ' || tm.nom, tm.email, 'Membre') AS actor_name,
                tm.email AS actor_email
           FROM public.team_member_activity tma
           LEFT JOIN public.team_members tm ON tm.id = tma.team_member_id
          ORDER BY tma.created_at DESC
          LIMIT $1`,
        [limit],
      ),
      tenantQuery(
        tenantId,
        `SELECT sal.id, sal.action, sal.target_type, sal.target_id, sal.token_prefix,
                sal.metadata, sal.created_at, sal.ip_address,
                COALESCE(u.name, u.email, 'Admin') AS actor_name,
                u.email AS actor_email
           FROM public.security_audit_log sal
           LEFT JOIN public.users u ON u.id = sal.actor_user_id
          ORDER BY sal.created_at DESC
          LIMIT $1`,
        [limit],
      ).catch(() => [] as any[]),
    ])

    /* Normalize into a common shape */
    const unified = [
      ...logs.map((r: any) => ({
        id:        `crud-${r.id}`,
        source:    'crud',
        module:    r.module_name,
        action:    r.action_type,
        title:     humanizeCrud(r.module_name, r.action_type),
        detail:    r.description,
        actor:     r.actor_name,
        actor_email: r.actor_email,
        record_id: r.record_id,
        ip:        null,
        created_at: r.created_at,
      })),
      ...memberActs.map((r: any) => ({
        id:        `mem-${r.id}`,
        source:    'member',
        module:    'team',
        action:    r.action_type,
        title:     humanizeMember(r.action_type),
        detail:    formatMemberDetail(r.action_type, r.action_details),
        actor:     r.actor_name,
        actor_email: r.actor_email,
        record_id: null,
        ip:        r.ip_address,
        created_at: r.created_at,
      })),
      ...securityActs.map((r: any) => ({
        id:        `sec-${r.id}`,
        source:    'security',
        module:    'security',
        action:    r.action,
        title:     humanizeSecurity(r.action),
        detail:    r.token_prefix ? `Token ${r.token_prefix}…` : '',
        actor:     r.actor_name,
        actor_email: r.actor_email,
        record_id: r.target_id,
        ip:        r.ip_address,
        created_at: r.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
     .slice(0, limit)

    res.json(unified)
  } catch (err: any) {
    logger.error('[activity]', err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

function humanizeCrud(module: string, action: string) {
  const modLabel: Record<string, string> = {
    factures: 'Facture', paiements: 'Paiement', devis: 'Devis',
    clients: 'Client', prospects: 'Prospect', expenses: 'Dépense',
    contrats: 'Contrat', fournisseurs: 'Fournisseur', team_members: 'Membre',
    personal_tasks: 'Tâche perso', projets: 'Projet',
  }
  const actLabel: Record<string, string> = {
    create: 'créé(e)', update: 'modifié(e)', delete: 'supprimé(e)',
  }
  return `${modLabel[module] ?? module} ${actLabel[action] ?? action}`
}

function humanizeMember(action: string) {
  const m: Record<string, string> = {
    login:               'Connexion',
    logout:              'Déconnexion',
    task_completed:      'Tâche terminée',
    task_updated:        'Tâche mise à jour',
    sop_viewed:          'SOP consulté',
    invitation_sent:     "Invitation envoyée",
    invitation_resent:   "Invitation renvoyée",
    invitation_accepted: 'Invitation acceptée',
    access_updated:      'Accès mis à jour',
    reset_link_shared:   'Lien de réinitialisation partagé',
    invite_link_shared:  "Lien d'invitation partagé",
    password_reset_requested: 'Réinit mot de passe demandée',
    suspended:           'Compte suspendu',
    activated:           'Compte réactivé',
  }
  return m[action] ?? action
}

function formatMemberDetail(action: string, details: any) {
  if (!details || typeof details !== 'object') return ''
  if (action === 'task_completed' || action === 'task_updated') return details.title ?? ''
  if (action === 'sop_viewed') return details.title ?? details.slug ?? ''
  return ''
}

function humanizeSecurity(action: string) {
  const m: Record<string, string> = {
    invite_issued:      "Invitation émise",
    invite_resent:      "Invitation renvoyée (sécurité)",
    reset_issued:       'Reset mot de passe émis',
    invite_link_shared: "Lien d'invitation partagé",
    reset_link_shared:  'Lien de réinitialisation partagé',
  }
  return m[action] ?? action
}

export default router
