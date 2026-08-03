/**
 * Opérations financières critiques — /api/finance
 *
 * ── Pourquoi une route dédiée plutôt que le CRUD générique ─────────
 * Le CRUD générique (`/api/:table`) écrit UNE ligne, sans logique. Or
 * quatre opérations de ce module ne sont correctes QUE si elles sont
 * indivisibles ou calculées côté serveur :
 *
 *   1. Ajustement de solde — l'ancien solde doit être LU par le serveur
 *      au moment de l'écriture. S'il venait du client, deux onglets
 *      ouverts produiraient deux écarts faux.
 *   2. Transfert — les deux comptes doivent appartenir au tenant et
 *      être différents ; la ligne porte le débit ET le crédit, donc il
 *      ne peut jamais y avoir de débit orphelin.
 *   3. « Marquer comme reçu/payé » — crée la transaction réelle ET
 *      solde la prévision. Jamais l'un sans l'autre → transaction SQL,
 *      avec verrou de ligne (`FOR UPDATE`) qui rend un double-clic
 *      inoffensif : la seconde requête voit le statut déjà soldé.
 *   4. Suppression d'un revenu/dépense issu d'une prévision — la
 *      prévision doit repasser en « prévu », sinon l'historique ment.
 *
 * ── Anti-doublon (double-clic, retry réseau) ───────────────────────
 * Chaque écriture accepte un `op_id` généré par le client. Un index
 * unique (tenant_id, op_id) garantit qu'un même clic rejoué n'écrit
 * qu'une fois ; la seconde requête reçoit la ligne déjà créée (200).
 */
import { Router, Request, Response, NextFunction } from 'express'
import type { PoolClient } from 'pg'
import { tenantQuery, tenantQueryOne, tenantTransaction } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { getEffectiveRole } from '../lib/effectiveRole'
import { logger } from '../lib/logger'

/* Rôle effectif résolu une fois par requête (relu en base par le garde de
   rôle), puis réutilisé par les contrôles fins de chaque endpoint. */
declare global {
  namespace Express {
    interface Request {
      financeRole?: string
    }
  }
}

const router = Router()
router.use(requireAuth)

/* ── Garde de rôle ────────────────────────────────────────────────
   Même périmètre que la création de paiements dans la matrice RBAC
   (server/middleware/rbac.ts) : admin, manager, comptable. Le rôle
   est relu en base, jamais pris dans le JWT — une rétrogradation
   s'applique immédiatement. */
const FINANCE_ROLES = new Set(['admin', 'manager', 'comptable'])

/* Écrire dans `depenses` est plus restreint que le reste du module : la
   matrice RBAC (server/middleware/rbac.ts → TABLE_ACL.depenses) réserve la
   création et la suppression à admin + comptable. Cette route ne doit pas
   ouvrir par la bande ce que le CRUD refuse — un manager qui ne peut pas
   POST /api/depenses ne doit pas non plus pouvoir en créer une en soldant
   une dépense prévue. */
const DEPENSE_WRITE_ROLES = new Set(['admin', 'comptable'])

async function requireFinanceRole(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.userId || !req.user?.tenantId) {
    return res.status(401).json({ error: 'Non authentifié' })
  }
  try {
    const role = await getEffectiveRole(req.user.userId, req.user.tenantId)
    if (!role || !FINANCE_ROLES.has(role)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' })
    }
    req.financeRole = role
    next()
  } catch {
    /* Fail-closed : en cas de doute sur les droits, on refuse. */
    return res.status(403).json({ error: 'Permissions insuffisantes' })
  }
}
router.use(requireFinanceRole)

/** Droit d'écrire dans `depenses` — aligné sur TABLE_ACL.depenses. */
function canWriteDepense(req: Request): boolean {
  return DEPENSE_WRITE_ROLES.has(req.financeRole ?? '')
}

/* ── Validation ──────────────────────────────────────────────────── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_MONTANT = 1_000_000_000

class ValidationError extends Error {
  status = 400
}
const fail = (msg: string): never => { throw new ValidationError(msg) }

/** Montant strictement positif, fini, arrondi au centime. */
function amount(v: unknown, label = 'Le montant'): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  if (!Number.isFinite(n)) fail(`${label} est invalide`)
  if (n <= 0) fail(`${label} doit être supérieur à 0`)
  if (n > MAX_MONTANT) fail(`${label} dépasse la limite autorisée`)
  return Math.round(n * 100) / 100
}

/** Montant signé (un nouveau solde peut être négatif ou nul). */
function signedAmount(v: unknown, label = 'Le montant'): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  if (!Number.isFinite(n)) fail(`${label} est invalide`)
  if (Math.abs(n) > MAX_MONTANT) fail(`${label} dépasse la limite autorisée`)
  return Math.round(n * 100) / 100
}

function uuid(v: unknown, label: string): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) fail(`${label} est obligatoire`)
  return v as string
}

function optionalUuid(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return typeof v === 'string' && UUID_RE.test(v) ? v : null
}

function isoDate(v: unknown): string {
  if (typeof v === 'string' && DATE_RE.test(v)) return v
  return new Date().toISOString().slice(0, 10)
}

function text(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function opId(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null
}

/* Les colonnes `categorie`/`type` de `depenses` sont des ENUM Postgres :
   une valeur hors liste ferait échouer l'INSERT. On retombe sur 'autre'
   plutôt que de refuser une prévision qui, elle, accepte du texte libre. */
const EXPENSE_CATEGORIES = ['transport', 'nourriture', 'maison', 'aumone', 'projet', 'autre']
const expenseCategory = (v: unknown): string =>
  typeof v === 'string' && EXPENSE_CATEGORIES.includes(v) ? v : 'autre'
const flowType = (v: unknown): 'personnel' | 'business' =>
  v === 'personnel' ? 'personnel' : 'business'

/* ── Anti-rejeu : la ligne déjà écrite sous ce op_id, s'il y en a une ── */
async function findByOpId<T>(
  tenantId: string, table: string, op: string | null,
): Promise<T | null> {
  if (!op) return null
  return tenantQueryOne<T>(
    tenantId,
    `SELECT * FROM ${table} WHERE tenant_id = $1 AND op_id = $2 LIMIT 1`,
    [tenantId, op],
  )
}

function handleError(res: Response, err: any, ctx: string) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message })
  }
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'Opération déjà enregistrée.' })
  }
  if (err?.code === '23503') {
    return res.status(400).json({ error: 'Compte ou référence introuvable.' })
  }
  if (err?.code === '23514') {
    return res.status(400).json({ error: 'Valeur non autorisée pour un des champs.' })
  }
  if (err?.status && err?.expose) {
    return res.status(err.status).json({ error: err.message })
  }
  logger.error(ctx, err?.code, err?.message)
  res.status(500).json({ error: 'Erreur serveur' })
}

/** Erreur métier renvoyée telle quelle au client (409 « déjà encaissée »…). */
function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status, expose: true })
}

/* Le compte existe-t-il dans CET espace ? (le filtre tenant est explicite
   en plus de la RLS — même défense en profondeur que crud.ts) */
async function assertAccount(tenantId: string, accountId: string | null): Promise<void> {
  if (!accountId) return
  const row = await tenantQueryOne(
    tenantId,
    `SELECT id FROM bank_accounts WHERE id = $1 AND tenant_id = $2`,
    [accountId, tenantId],
  )
  if (!row) fail('Compte introuvable')
}

/* ════════════════════════════════════════════════════════════════════
   REVENUS ENCAISSÉS
   ══════════════════════════════════════════════════════════════════ */
router.post('/revenus', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const op = opId(req.body?.op_id)
    const existing = await findByOpId<any>(tenantId, 'revenus', op)
    if (existing) return res.status(200).json(existing)

    const montant = amount(req.body?.montant)
    const account = optionalUuid(req.body?.bank_account_id)
    if (!account) fail('Le compte de destination est obligatoire')
    await assertAccount(tenantId, account)

    const row = await tenantQueryOne(
      tenantId,
      `INSERT INTO revenus
         (tenant_id, montant, date_revenu, bank_account_id, categorie, source,
          client_id, projet_id, description, type, op_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        tenantId,
        montant,
        isoDate(req.body?.date_revenu),
        account,
        text(req.body?.categorie, 60) ?? 'autre',
        text(req.body?.source, 200),
        optionalUuid(req.body?.client_id),
        optionalUuid(req.body?.projet_id),
        text(req.body?.description, 2000),
        flowType(req.body?.type),
        op,
        req.user!.userId,
      ],
    )
    res.status(201).json(row)
  } catch (err: any) {
    /* Course entre deux clics : l'index unique a tranché, on renvoie
       la ligne gagnante plutôt qu'une erreur. */
    if (err?.code === '23505') {
      const winner = await findByOpId(tenantId, 'revenus', opId(req.body?.op_id))
      if (winner) return res.status(200).json(winner)
    }
    handleError(res, err, '[POST /api/finance/revenus]')
  }
})

/* Suppression cohérente : si le revenu réalisait une prévision, la
   prévision redevient « prévue » — sinon elle resterait « reçue » sans
   encaissement derrière. */
router.delete('/revenus/:id', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const id = uuid(req.params.id, 'Identifiant')
    const result = await tenantTransaction(tenantId, async (client: PoolClient) => {
      const { rows } = await client.query(
        `SELECT * FROM revenus WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId],
      )
      const revenu = rows[0]
      if (!revenu) throw httpError(404, 'Revenu introuvable')

      /* Ordre imposé par le garde-fou de la base (trigger
         previsions_guard_reouverture) : la transaction doit avoir DISPARU
         avant que la prévision ne se rouvre. Les deux écritures étant dans
         la même transaction SQL, l'état intermédiaire n'est jamais visible. */
      await client.query(`DELETE FROM revenus WHERE id = $1 AND tenant_id = $2`, [id, tenantId])
      if (revenu.prevision_id) {
        await client.query(
          `UPDATE previsions_financieres
              SET statut = 'prevu', montant_realise = NULL, date_realisation = NULL,
                  revenu_id = NULL
            WHERE id = $1 AND tenant_id = $2`,
          [revenu.prevision_id, tenantId],
        )
      }
      return { success: true, prevision_id: revenu.prevision_id ?? null }
    })
    res.json(result)
  } catch (err: any) {
    handleError(res, err, '[DELETE /api/finance/revenus]')
  }
})

/* Idem pour une dépense : la page Dépenses passe par ici afin qu'une
   dépense issue d'une prévision rouvre celle-ci en la supprimant. */
router.delete('/depenses/:id', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    /* Même périmètre que DELETE /api/depenses (TABLE_ACL.depenses). */
    if (!canWriteDepense(req)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' })
    }
    const id = uuid(req.params.id, 'Identifiant')
    const result = await tenantTransaction(tenantId, async (client: PoolClient) => {
      const { rows } = await client.query(
        `SELECT * FROM depenses WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId],
      )
      const depense = rows[0]
      if (!depense) throw httpError(404, 'Dépense introuvable')

      /* Suppression AVANT réouverture — cf. commentaire du DELETE revenus. */
      await client.query(`DELETE FROM depenses WHERE id = $1 AND tenant_id = $2`, [id, tenantId])
      if (depense.prevision_id) {
        await client.query(
          `UPDATE previsions_financieres
              SET statut = 'prevu', montant_realise = NULL, date_realisation = NULL,
                  depense_id = NULL
            WHERE id = $1 AND tenant_id = $2`,
          [depense.prevision_id, tenantId],
        )
      }
      return { success: true, prevision_id: depense.prevision_id ?? null }
    })
    res.json(result)
  } catch (err: any) {
    handleError(res, err, '[DELETE /api/finance/depenses]')
  }
})

/* ════════════════════════════════════════════════════════════════════
   TRANSFERTS ENTRE COMPTES
   Ni revenu ni dépense : le patrimoine total ne bouge pas.
   ══════════════════════════════════════════════════════════════════ */
router.post('/transferts', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const op = opId(req.body?.op_id)
    const existing = await findByOpId<any>(tenantId, 'transferts_comptes', op)
    if (existing) return res.status(200).json(existing)

    const source = uuid(req.body?.compte_source_id, 'Le compte source')
    const dest   = uuid(req.body?.compte_destination_id, 'Le compte de destination')
    if (source === dest) fail('Le compte source et le compte de destination doivent être différents')
    const montant = amount(req.body?.montant)
    await assertAccount(tenantId, source)
    await assertAccount(tenantId, dest)

    const row = await tenantQueryOne(
      tenantId,
      `INSERT INTO transferts_comptes
         (tenant_id, compte_source_id, compte_destination_id, montant,
          date_transfert, note, op_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [tenantId, source, dest, montant, isoDate(req.body?.date_transfert),
       text(req.body?.note, 500), op, req.user!.userId],
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err?.code === '23505') {
      const winner = await findByOpId(tenantId, 'transferts_comptes', opId(req.body?.op_id))
      if (winner) return res.status(200).json(winner)
    }
    handleError(res, err, '[POST /api/finance/transferts]')
  }
})

router.delete('/transferts/:id', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const id = uuid(req.params.id, 'Identifiant')
    const row = await tenantQueryOne(
      tenantId,
      `DELETE FROM transferts_comptes WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId],
    )
    if (!row) return res.status(404).json({ error: 'Transfert introuvable' })
    res.json({ success: true })
  } catch (err: any) {
    handleError(res, err, '[DELETE /api/finance/transferts]')
  }
})

/* ════════════════════════════════════════════════════════════════════
   AJUSTEMENT MANUEL DE SOLDE
   Journal en ajout seul : on n'écrase jamais, on enregistre l'écart.
   ══════════════════════════════════════════════════════════════════ */
router.post('/ajustements', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const op = opId(req.body?.op_id)
    const existing = await findByOpId<any>(tenantId, 'bank_account_adjustments', op)
    if (existing) return res.status(200).json(existing)

    const accountId    = uuid(req.body?.bank_account_id, 'Le compte')
    const nouveauSolde = signedAmount(req.body?.nouveau_solde, 'Le nouveau solde')
    const motif        = ['depenses_non_enregistrees', 'revenus_non_enregistres', 'correction', 'autre']
      .includes(req.body?.motif) ? req.body.motif : 'correction'

    const result = await tenantTransaction(tenantId, async (client: PoolClient) => {
      /* Verrou sur le compte : deux ajustements simultanés ne peuvent
         pas lire le même « ancien solde » et se marcher dessus. */
      const { rows: accRows } = await client.query(
        `SELECT id FROM bank_accounts WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [accountId, tenantId],
      )
      if (!accRows[0]) throw httpError(404, 'Compte introuvable')

      /* L'ancien solde est LU par le serveur : c'est le solde réel au
         moment de l'écriture, pas celui affiché dans l'onglet client. */
      const { rows: soldeRows } = await client.query(
        `SELECT solde_live FROM bank_accounts_with_solde WHERE id = $1 AND tenant_id = $2`,
        [accountId, tenantId],
      )
      const ancienSolde = Math.round(Number(soldeRows[0]?.solde_live ?? 0) * 100) / 100
      const difference  = Math.round((nouveauSolde - ancienSolde) * 100) / 100
      if (difference === 0) throw httpError(400, 'Le nouveau solde est identique au solde actuel')

      const { rows } = await client.query(
        `INSERT INTO bank_account_adjustments
           (tenant_id, bank_account_id, ancien_solde, nouveau_solde, difference,
            motif, note, date_ajustement, op_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [tenantId, accountId, ancienSolde, nouveauSolde, difference, motif,
         text(req.body?.note, 1000), isoDate(req.body?.date_ajustement), op, req.user!.userId],
      )
      return rows[0]
    })
    res.status(201).json(result)
  } catch (err: any) {
    if (err?.code === '23505') {
      const winner = await findByOpId(tenantId, 'bank_account_adjustments', opId(req.body?.op_id))
      if (winner) return res.status(200).json(winner)
    }
    handleError(res, err, '[POST /api/finance/ajustements]')
  }
})

/* ════════════════════════════════════════════════════════════════════
   PRÉVISIONS — « Marquer comme reçu / payé »
   ══════════════════════════════════════════════════════════════════ */
const SOLDE_STATUTS = ['recu', 'paye', 'annule']

router.post('/previsions/:id/settle', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const id      = uuid(req.params.id, 'Identifiant')
    const op      = opId(req.body?.op_id)
    const account = optionalUuid(req.body?.bank_account_id)
    const dateOp  = isoDate(req.body?.date_realisation)

    const result = await tenantTransaction(tenantId, async (client: PoolClient) => {
      /* FOR UPDATE : le second clic attend, puis voit le statut soldé.
         C'est ce verrou — pas le bouton désactivé côté UI — qui rend le
         double encaissement impossible. */
      const { rows } = await client.query(
        `SELECT * FROM previsions_financieres
          WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId],
      )
      const prev = rows[0]
      if (!prev) throw httpError(404, 'Prévision introuvable')
      /* Solder une dépense prévue CRÉE une dépense : même droit exigé que
         pour POST /api/depenses. Le contrôle est ici, une fois le sens
         connu — un revenu prévu reste ouvert à admin/manager/comptable. */
      if (prev.sens === 'depense' && !canWriteDepense(req)) {
        throw httpError(403, 'Permissions insuffisantes')
      }
      if (SOLDE_STATUTS.includes(prev.statut)) {
        throw httpError(409, prev.statut === 'annule'
          ? 'Cette prévision est annulée.'
          : 'Cette prévision a déjà été encaissée.')
      }

      const montant     = amount(req.body?.montant ?? prev.montant, 'Le montant reçu')
      const accountId   = account ?? prev.bank_account_id
      if (!accountId) throw httpError(400, 'Le compte est obligatoire')
      const { rows: accRows } = await client.query(
        `SELECT id FROM bank_accounts WHERE id = $1 AND tenant_id = $2`,
        [accountId, tenantId],
      )
      if (!accRows[0]) throw httpError(400, 'Compte introuvable')

      if (prev.sens === 'revenu') {
        const { rows: revRows } = await client.query(
          `INSERT INTO revenus
             (tenant_id, montant, date_revenu, bank_account_id, categorie, source,
              client_id, projet_id, description, type, prevision_id, op_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING *`,
          [tenantId, montant, dateOp, accountId, prev.categorie ?? 'autre', prev.source,
           prev.client_id, prev.projet_id, prev.description, prev.type ?? 'business',
           prev.id, op, req.user!.userId],
        )
        const { rows: updated } = await client.query(
          `UPDATE previsions_financieres
              SET statut = 'recu', montant_realise = $3, date_realisation = $4,
                  revenu_id = $5, bank_account_id = COALESCE($6, bank_account_id)
            WHERE id = $1 AND tenant_id = $2
            RETURNING *`,
          [id, tenantId, montant, dateOp, revRows[0].id, accountId],
        )
        return { prevision: updated[0], transaction: revRows[0], sens: 'revenu' }
      }

      const { rows: depRows } = await client.query(
        `INSERT INTO depenses
           (tenant_id, montant, date_depense, categorie, type, description,
            bank_account_id, prevision_id, op_id)
         VALUES ($1,$2,$3,$4::expense_category,$5::expense_type,$6,$7,$8,$9)
         RETURNING *`,
        [tenantId, montant, dateOp, expenseCategory(prev.categorie), flowType(prev.type),
         prev.description ?? prev.source, accountId, prev.id, op],
      )
      const { rows: updated } = await client.query(
        `UPDATE previsions_financieres
            SET statut = 'paye', montant_realise = $3, date_realisation = $4,
                depense_id = $5, bank_account_id = COALESCE($6, bank_account_id)
          WHERE id = $1 AND tenant_id = $2
          RETURNING *`,
        [id, tenantId, montant, dateOp, depRows[0].id, accountId],
      )
      return { prevision: updated[0], transaction: depRows[0], sens: 'depense' }
    })

    res.status(201).json(result)
  } catch (err: any) {
    handleError(res, err, '[POST /api/finance/previsions/settle]')
  }
})

/* Annulation — la prévision reste dans l'historique, elle sort
   simplement du prévisionnel actif. */
router.post('/previsions/:id/cancel', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const id = uuid(req.params.id, 'Identifiant')
    const row = await tenantQueryOne(
      tenantId,
      `UPDATE previsions_financieres
          SET statut = 'annule'
        WHERE id = $1 AND tenant_id = $2 AND statut NOT IN ('recu','paye')
        RETURNING *`,
      [id, tenantId],
    )
    if (!row) {
      return res.status(409).json({
        error: 'Prévision introuvable ou déjà réalisée (supprimez la transaction liée pour la rouvrir).',
      })
    }
    res.json(row)
  } catch (err: any) {
    handleError(res, err, '[POST /api/finance/previsions/cancel]')
  }
})

/* Réouverture d'une prévision annulée. */
router.post('/previsions/:id/reopen', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const id = uuid(req.params.id, 'Identifiant')
    const row = await tenantQueryOne(
      tenantId,
      `UPDATE previsions_financieres
          SET statut = 'prevu'
        WHERE id = $1 AND tenant_id = $2 AND statut = 'annule'
        RETURNING *`,
      [id, tenantId],
    )
    if (!row) return res.status(409).json({ error: 'Seule une prévision annulée peut être rouverte.' })
    res.json(row)
  } catch (err: any) {
    handleError(res, err, '[POST /api/finance/previsions/reopen]')
  }
})

/* ════════════════════════════════════════════════════════════════════
   SYNTHÈSE — soldes réels calculés par la base (source de vérité)
   Le front recalcule les mêmes chiffres à partir des listes qu'il a
   déjà en cache ; cette route permet de VÉRIFIER qu'ils concordent.
   ══════════════════════════════════════════════════════════════════ */
router.get('/soldes', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const rows = await tenantQuery(
      tenantId,
      `SELECT id, nom, devise, actif, solde_initial, total_paiements, total_revenus,
              total_depenses, total_transferts_entrants, total_transferts_sortants,
              total_ajustements, solde_live
         FROM bank_accounts_with_solde
        WHERE tenant_id = $1
        ORDER BY created_at ASC`,
      [tenantId],
    )
    const disponible = rows.reduce((s: number, r: any) => s + Number(r.solde_live || 0), 0)

    const [prev] = await tenantQuery(
      tenantId,
      `SELECT
         COALESCE(SUM(montant) FILTER (WHERE sens = 'revenu'),  0) AS revenus_prevus,
         COALESCE(SUM(montant) FILTER (WHERE sens = 'depense'), 0) AS depenses_prevues
       FROM previsions_financieres
       WHERE tenant_id = $1 AND statut NOT IN ('recu','paye','annule')`,
      [tenantId],
    )
    const revenusPrevus   = Number(prev?.revenus_prevus || 0)
    const depensesPrevues = Number(prev?.depenses_prevues || 0)

    res.json({
      comptes: rows,
      disponible,
      revenus_prevus:   revenusPrevus,
      depenses_prevues: depensesPrevues,
      solde_previsionnel: Math.round((disponible + revenusPrevus - depensesPrevues) * 100) / 100,
    })
  } catch (err: any) {
    handleError(res, err, '[GET /api/finance/soldes]')
  }
})

export default router
