/**
 * Récupération des paiements manquants — recrée les paiements
 * à partir des CONTRATS et FACTURES existants du tenant.
 *
 * Réservé aux admins. Transactionnel (BEGIN/COMMIT). Ne crée
 * JAMAIS de doublons (NOT EXISTS + reference unique).
 *
 * Endpoints :
 *   POST /api/paiements-recovery/diagnostic   → dry-run, retourne le plan
 *   POST /api/paiements-recovery/execute      → exécute (crée les paiements)
 */
import { Router, Request, Response } from 'express'
import { pool, tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth, requireRole } from '../middleware/auth'
import { logger } from '../lib/logger'

const router = Router()
router.use(requireAuth)
router.use(requireRole('admin'))

/* ── Diagnostic : compte ce qui serait recréé (sans écrire) ── */
router.post('/diagnostic', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const [current, contratsOrphelins, facturesOrphelines] = await Promise.all([
      tenantQueryOne<any>(tenantId,
        `SELECT COUNT(*)::int AS n FROM paiements`, []),
      tenantQuery<any>(tenantId, `
        SELECT c.id, c.numero, c.client, c.montant, c.date_debut, c.type_paiement
        FROM contrats c
        WHERE c.statut = 'actif'
          AND c.client_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.contrat_id = c.id)
        ORDER BY c.date_debut DESC
      `, []),
      tenantQuery<any>(tenantId, `
        SELECT f.id, f.numero, f.client_nom, f.montant_ttc, f.montant_ht,
               f.date_emission, f.statut
        FROM factures f
        WHERE f.statut IN ('payee','envoyee','en_retard')
          AND f.client_id IS NOT NULL
          AND COALESCE(NULLIF(f.montant_ttc, 0), f.montant_ht) > 0
          AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.facture_id = f.id)
        ORDER BY f.date_emission DESC
      `, []),
    ])

    const totalMontantContrats  = contratsOrphelins.reduce((s: number, c: any) => s + Number(c.montant || 0), 0)
    const totalMontantFactures  = facturesOrphelines.reduce((s: number, f: any) =>
      s + Number(f.montant_ttc || f.montant_ht || 0), 0)

    res.json({
      paiements_actuels:     current?.n ?? 0,
      contrats_a_recreer:    contratsOrphelins.length,
      factures_a_recreer:    facturesOrphelines.length,
      montant_contrats:      totalMontantContrats,
      montant_factures:      totalMontantFactures,
      montant_total:         totalMontantContrats + totalMontantFactures,
      contrats:              contratsOrphelins.slice(0, 20),  // preview
      factures:              facturesOrphelines.slice(0, 20),
    })
  } catch (e: any) {
    logger.error('[paiements-recovery/diagnostic]', e?.message, e?.detail)
    res.status(500).json({ error: 'Diagnostic échoué : ' + (e?.message ?? 'inconnue') })
  }
})

/* ── Execute : recrée réellement les paiements (transactionnel) ── */
router.post('/execute', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId
  const dryRun   = req.body?.dry_run === true

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL app.current_tenant = $1`, [tenantId])

    /* Étape 1 : recréer depuis les contrats */
    const contratsResult = await client.query(`
      INSERT INTO paiements (
        tenant_id, reference, contrat_id, client_id,
        date, montant, type_paiement, methode, status, notes,
        created_at, updated_at
      )
      SELECT
        c.tenant_id,
        'REC-CTR-' || SUBSTR(c.id::text, 1, 8) || '-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || (ROW_NUMBER() OVER (ORDER BY c.created_at))::text,
        c.id,
        c.client_id,
        COALESCE(c.date_debut, CURRENT_DATE),
        c.montant,
        c.type_paiement,
        'virement'::payment_method,
        'en_attente'::payment_status,
        'Auto-recréé depuis le contrat ' || c.numero || ' (le ' || TO_CHAR(NOW(), 'DD/MM/YYYY') || ')',
        NOW(), NOW()
      FROM contrats c
      WHERE c.tenant_id = $1
        AND c.statut = 'actif'
        AND c.client_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.contrat_id = c.id)
      RETURNING id, montant
    `, [tenantId])

    /* Étape 2 : recréer depuis les factures qui n'ont pas de contrat */
    const facturesResult = await client.query(`
      INSERT INTO paiements (
        tenant_id, reference, facture_id, client_id,
        date, montant, type_paiement, methode, status, notes,
        created_at, updated_at
      )
      SELECT
        f.tenant_id,
        'REC-FAC-' || SUBSTR(f.id::text, 1, 8) || '-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || (ROW_NUMBER() OVER (ORDER BY f.created_at))::text,
        f.id,
        f.client_id,
        f.date_emission,
        COALESCE(NULLIF(f.montant_ttc, 0), f.montant_ht),
        'autre'::payment_type,
        'virement'::payment_method,
        CASE
          WHEN f.statut = 'payee' THEN 'paye'::payment_status
          ELSE 'en_attente'::payment_status
        END,
        'Auto-recréé depuis la facture ' || f.numero || ' (le ' || TO_CHAR(NOW(), 'DD/MM/YYYY') || ')',
        f.created_at, NOW()
      FROM factures f
      WHERE f.tenant_id = $1
        AND f.statut IN ('payee','envoyee','en_retard')
        AND f.client_id IS NOT NULL
        AND COALESCE(NULLIF(f.montant_ttc, 0), f.montant_ht) > 0
        AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.facture_id = f.id)
      RETURNING id, montant
    `, [tenantId])

    if (dryRun) {
      await client.query('ROLLBACK')
    } else {
      await client.query('COMMIT')
    }

    const contratsCreated = contratsResult.rowCount ?? 0
    const facturesCreated = facturesResult.rowCount ?? 0
    const totalMontant =
      contratsResult.rows.reduce((s, r) => s + Number(r.montant || 0), 0) +
      facturesResult.rows.reduce((s, r) => s + Number(r.montant || 0), 0)

    /* Log */
    if (!dryRun && (contratsCreated + facturesCreated) > 0) {
      try {
        await pool.query(`
          INSERT INTO activity_logs (tenant_id, actor_id, action, entity_type, metadata, created_at)
          VALUES ($1, $2, 'recovery', 'paiement', $3, NOW())
        `, [tenantId, userId, JSON.stringify({
          contrats_created: contratsCreated,
          factures_created: facturesCreated,
          total_montant: totalMontant,
        })])
      } catch {/* activity_logs facultatif */}
    }

    res.json({
      dry_run:            dryRun,
      contrats_recrees:   contratsCreated,
      factures_recrees:   facturesCreated,
      total_paiements:    contratsCreated + facturesCreated,
      montant_total:      totalMontant,
      message:            dryRun
        ? `Simulation : ${contratsCreated + facturesCreated} paiements seraient créés (${totalMontant.toLocaleString('fr-FR')} MAD)`
        : `${contratsCreated + facturesCreated} paiements créés (${totalMontant.toLocaleString('fr-FR')} MAD)`,
    })
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error('[paiements-recovery/execute]', e?.message, e?.detail)
    res.status(500).json({ error: 'Recovery échoué : ' + (e?.message ?? 'inconnue') })
  } finally {
    client.release()
  }
})

/* ── Restore depuis un fichier backup pg_dump (.sql) ──
     Le fichier est envoyé en base64 dans le body (JSON). On extrait
     UNIQUEMENT les INSERT INTO paiements, on filtre par tenant du
     token, et on skippe les paiements dont l'id existe déjà. */
router.post('/restore-from-backup', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId
  const dryRun   = req.body?.dry_run === true

  const sqlContent = String(req.body?.sql_content ?? '').trim()
  if (!sqlContent) return res.status(400).json({ error: 'sql_content requis (contenu du fichier pg_dump)' })
  if (sqlContent.length > 100 * 1024 * 1024) {
    return res.status(413).json({ error: 'Fichier trop volumineux (max 100 MB)' })
  }

  /* Parse : extrait tous les INSERT INTO paiements (case-insensitive, multi-line) */
  const inserts = extractPaiementInserts(sqlContent, tenantId)
  if (!inserts.length) {
    return res.status(400).json({
      error: 'Aucun INSERT INTO paiements trouvé pour votre tenant dans le fichier',
      hint:  'Vérifiez que le backup contient bien la table "paiements" et concerne ce tenant.',
    })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL app.current_tenant = $1`, [tenantId])
    await client.query(`SET LOCAL row_security = OFF`)  /* On veut voir les IDs existants pour dédupliquer */

    /* Récupère les ids existants pour ce tenant → skip si déjà là. */
    const { rows: existingRows } = await client.query(
      `SELECT id, reference FROM paiements WHERE tenant_id = $1`, [tenantId])
    const existingIds  = new Set(existingRows.map((r: any) => r.id))
    const existingRefs = new Set(existingRows.map((r: any) => r.reference))

    let inserted = 0
    let skippedExisting = 0
    let skippedInvalid  = 0
    const errors: string[] = []
    let totalMontant = 0

    for (const ins of inserts) {
      /* Skip si id déjà présent, ou reference déjà présente (contrainte unique). */
      if (ins.id && existingIds.has(ins.id))          { skippedExisting++; continue }
      if (ins.reference && existingRefs.has(ins.reference)) { skippedExisting++; continue }
      if (!ins.reference || !ins.client_id)           { skippedInvalid++;  continue }

      try {
        await client.query(ins.rawSql, ins.rawParams)
        inserted++
        totalMontant += Number(ins.montant || 0)
        if (ins.id)        existingIds.add(ins.id)
        if (ins.reference) existingRefs.add(ins.reference)
      } catch (err: any) {
        errors.push(`${ins.reference ?? '?'} : ${err?.message?.slice(0, 100) ?? 'err'}`)
        if (errors.length > 10) break  /* stop early on cascading errors */
      }
    }

    if (dryRun || errors.length > 10) {
      await client.query('ROLLBACK')
    } else {
      await client.query('COMMIT')
    }

    /* Log activity */
    if (!dryRun && errors.length <= 10 && inserted > 0) {
      try {
        await pool.query(`
          INSERT INTO activity_logs (tenant_id, actor_id, action, entity_type, metadata, created_at)
          VALUES ($1, $2, 'restore_from_backup', 'paiement', $3, NOW())
        `, [tenantId, userId, JSON.stringify({
          inserted, skipped_existing: skippedExisting, skipped_invalid: skippedInvalid,
          total_montant: totalMontant, backup_size_kb: Math.round(sqlContent.length / 1024),
        })])
      } catch {/* activity_logs facultatif */}
    }

    res.json({
      dry_run:            dryRun,
      inserts_trouves:    inserts.length,
      inserted,
      skipped_existing:   skippedExisting,
      skipped_invalid:    skippedInvalid,
      erreurs:            errors,
      montant_restaure:   totalMontant,
      message:            dryRun
        ? `Simulation : ${inserted} paiements seraient restaurés (${totalMontant.toLocaleString('fr-FR')} MAD)`
        : errors.length > 10
        ? `Trop d'erreurs (${errors.length}) — restauration annulée`
        : `${inserted} paiements restaurés (${totalMontant.toLocaleString('fr-FR')} MAD), ${skippedExisting} déjà présents`,
    })
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error('[paiements-recovery/restore-from-backup]', e?.message, e?.detail)
    res.status(500).json({ error: 'Restauration échouée : ' + (e?.message ?? 'inconnue') })
  } finally {
    client.release()
  }
})

/* ─── Parser pg_dump : extrait les INSERT INTO paiements de ce tenant ─── */
interface ParsedInsert {
  id:        string | null
  reference: string | null
  client_id: string | null
  montant:   number | null
  rawSql:    string
  rawParams: any[]
}

function extractPaiementInserts(sqlContent: string, expectedTenantId: string): ParsedInsert[] {
  const results: ParsedInsert[] = []

  /* pg_dump génère 2 formats :
     1. INSERT INTO paiements (col1, col2, ...) VALUES (v1, v2, ...);
     2. COPY paiements (col1, col2, ...) FROM stdin;  \n  v1\tv2\t...  \n  \.
     On supporte les 2. */

  /* Format 1 : INSERT INTO */
  const insertRe = /INSERT\s+INTO\s+(?:public\.)?paiements\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]*?)\);/gim
  let m: RegExpExecArray | null
  while ((m = insertRe.exec(sqlContent)) !== null) {
    const cols = m[1].split(',').map(c => c.trim().replace(/"/g, ''))
    const vals = parseSqlValues(m[2])
    if (cols.length !== vals.length) continue

    const record = Object.fromEntries(cols.map((c, i) => [c, vals[i]])) as Record<string, any>
    if (record.tenant_id !== expectedTenantId) continue

    /* Reconstruit un INSERT paramétré (safer) */
    const insertCols = cols.join(', ')
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
    const rawSql = `INSERT INTO paiements (${insertCols}) VALUES (${placeholders})`

    results.push({
      id:        record.id ?? null,
      reference: record.reference ?? null,
      client_id: record.client_id ?? null,
      montant:   Number(record.montant ?? 0),
      rawSql,
      rawParams: vals,
    })
  }

  /* Format 2 : COPY paiements FROM stdin */
  const copyRe = /COPY\s+(?:public\.)?paiements\s*\(([^)]+)\)\s+FROM\s+stdin;\s*\n([\s\S]*?)\n\\\.\s*/gim
  let cm: RegExpExecArray | null
  while ((cm = copyRe.exec(sqlContent)) !== null) {
    const cols = cm[1].split(',').map(c => c.trim().replace(/"/g, ''))
    const lines = cm[2].split('\n').filter(l => l.length > 0)

    for (const line of lines) {
      const vals = line.split('\t').map(v => v === '\\N' ? null : v)
      if (cols.length !== vals.length) continue
      const record = Object.fromEntries(cols.map((c, i) => [c, vals[i]])) as Record<string, any>
      if (record.tenant_id !== expectedTenantId) continue

      const insertCols = cols.join(', ')
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      const rawSql = `INSERT INTO paiements (${insertCols}) VALUES (${placeholders})`

      results.push({
        id:        record.id ?? null,
        reference: record.reference ?? null,
        client_id: record.client_id ?? null,
        montant:   Number(record.montant ?? 0),
        rawSql,
        rawParams: vals,
      })
    }
  }

  return results
}

/* Parse la partie VALUES d'un INSERT SQL — gère quotes, escapes, NULL. */
function parseSqlValues(str: string): any[] {
  const out: any[] = []
  let i = 0
  let current = ''
  let inString = false

  while (i < str.length) {
    const ch = str[i]

    if (inString) {
      if (ch === "'" && str[i + 1] === "'") { current += "'"; i += 2; continue }  /* escaped '' */
      if (ch === '\\' && str[i + 1]) { current += str[i + 1]; i += 2; continue }  /* backslash escape */
      if (ch === "'") { inString = false; i++; continue }
      current += ch; i++; continue
    }

    if (ch === "'") { inString = true; i++; continue }
    if (ch === ',') {
      out.push(coerceSqlValue(current.trim()))
      current = ''; i++; continue
    }
    current += ch; i++
  }
  if (current.trim().length > 0) out.push(coerceSqlValue(current.trim()))
  return out
}

function coerceSqlValue(raw: string): any {
  if (raw === 'NULL' || raw === 'null' || raw === '') return null
  if (raw === 'true' || raw === 'TRUE')  return true
  if (raw === 'false' || raw === 'FALSE') return false
  /* strings arrivent déjà sans quotes (retirées par parseSqlValues au niveau string) */
  return raw
}

export default router
