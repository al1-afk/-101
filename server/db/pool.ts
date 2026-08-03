import { Pool, PoolClient, types } from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

types.setTypeParser(1700, (val) => val === null ? null : parseFloat(val))
types.setTypeParser(20,   (val) => val === null ? null : parseInt(val, 10))

/* DATE (oid 1082) → chaîne 'YYYY-MM-DD' brute, PAS un objet Date.
   Par défaut, pg construit `new Date(y, m, d)` — minuit en heure LOCALE du
   process. `JSON.stringify` le sérialise ensuite en UTC : sur un serveur à
   UTC+1 (Africa/Casablanca), la date du 2026-08-01 part vers le client en
   "2026-07-31T23:00:00.000Z". Toute comparaison de mois ou de jour côté
   client (`startsWith('2026-08')`, `date === aujourdhui`) est alors fausse
   d'un jour, et un `<input type="date">` reçoit une valeur qu'il refuse.
   Une DATE n'a pas de fuseau : on la transmet telle qu'elle est stockée.
   (server/lib/expiryReminderScheduler.ts contournait déjà le problème avec
   to_char(...) — ce parser rend le contournement inutile partout ailleurs.) */
types.setTypeParser(1082, (val) => val)

export const pool = new Pool({
  host:     process.env.PG_HOST     || 'localhost',
  port:     Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'gestiq',
  user:     process.env.PG_USER     || 'postgres',
  password: process.env.PG_PASSWORD || '',
  max:      20,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 2_000,
})

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message)
})

/* ── Simple queries (no RLS context needed) ───────────────────── */
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const { rows } = await pool.query(sql, params)
  return rows
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const { rows } = await pool.query(sql, params)
  return rows[0] ?? null
}

/* ── Tenant-scoped query: sets app.current_tenant for RLS ────────
   Uses a dedicated connection from the pool so the SET is scoped
   to this transaction only and never leaks to other requests.
─────────────────────────────────────────────────────────────── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* ── Rôle d'exécution soumis à la RLS ──────────────────────────────
   La RLS ne s'applique NI à un rôle SUPERUSER/BYPASSRLS, NI au
   propriétaire d'une table non FORCÉE. Le cloisonnement de la plupart
   des routes (team, stock, vehicles, outbound, mySpace…) repose
   pourtant uniquement sur elle : leurs requêtes s'écrivent
   `WHERE id = $1`, sans filtre tenant explicite.

   On bascule donc, le temps de la transaction, sur un rôle créé
   explicitement NOSUPERUSER/NOBYPASSRLS (migration 082). La sécurité
   cesse ainsi de dépendre de la configuration du compte de connexion.

   Le basculement est conditionnel : si le rôle n'existe pas ou n'est
   pas accessible, on continue sans lui (avec un avertissement au
   démarrage) plutôt que de mettre l'application à genoux. */
const RLS_ROLE = process.env.PG_RLS_ROLE || 'gestiq_rls'
let rlsRoleAvailable: boolean | null = null

export async function probeRlsRole(): Promise<boolean> {
  if (rlsRoleAvailable !== null) return rlsRoleAvailable
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL ROLE ${quoteIdent(RLS_ROLE)}`)
    /* Vérifie que le rôle pris est bien dépourvu de tout privilège
       d'échappement — un rôle superuser ne servirait à rien ici. */
    const { rows } = await client.query(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
    )
    await client.query('ROLLBACK')
    rlsRoleAvailable = !!rows[0] && !rows[0].rolsuper && !rows[0].rolbypassrls
  } catch {
    await client.query('ROLLBACK').catch(() => {})
    rlsRoleAvailable = false
  } finally {
    client.release()
  }
  if (!rlsRoleAvailable) {
    console.warn(
      `[rls] rôle « ${RLS_ROLE} » indisponible — les requêtes tenant s'exécuteront ` +
      `avec le compte de connexion. Vérifiez que ce compte n'est ni SUPERUSER ni ` +
      `BYPASSRLS, sinon le cloisonnement par RLS ne s'applique pas (migration 082).`
    )
  }
  return rlsRoleAvailable
}

/* Identifiant SQL — le nom du rôle vient de la configuration, jamais
   d'une requête utilisateur, mais on l'échappe malgré tout. */
function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

export async function tenantQuery<T = any>(
  tenantId: string,
  sql: string,
  params?: any[],
): Promise<T[]> {
  if (!UUID_RE.test(tenantId)) throw new Error('Invalid tenantId')

  const useRlsRole = rlsRoleAvailable ?? await probeRlsRole()
  const client: PoolClient = await pool.connect()
  try {
    await client.query('BEGIN')
    /* Bascule AVANT le réglage tenant : le SET LOCAL survit dans la
       transaction et n'affecte aucune autre requête du pool. */
    if (useRlsRole) await client.query(`SET LOCAL ROLE ${quoteIdent(RLS_ROLE)}`)
    /* SET LOCAL does not accept $1 — UUID is validated above */
    await client.query(`SET LOCAL "app.current_tenant" = '${tenantId}'`)
    const { rows } = await client.query(sql, params)
    await client.query('COMMIT')
    return rows
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function tenantQueryOne<T = any>(
  tenantId: string,
  sql: string,
  params?: any[],
): Promise<T | null> {
  const rows = await tenantQuery<T>(tenantId, sql, params)
  return rows[0] ?? null
}

/* ── Transaction tenant : PLUSIEURS requêtes, tout ou rien ────────
   `tenantQuery` ouvre et referme sa propre transaction à chaque appel :
   deux appels successifs peuvent donc laisser la base à mi-chemin (une
   écriture passée, l'autre échouée). Inacceptable pour une opération
   financière — « Marquer comme reçu » crée un revenu ET solde la
   prévision : jamais l'un sans l'autre.

   Le callback reçoit le client, déjà positionné sur le rôle RLS et le
   tenant courant. COMMIT si le callback renvoie, ROLLBACK s'il lève.
─────────────────────────────────────────────────────────────── */
export async function tenantTransaction<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) throw new Error('Invalid tenantId')

  const useRlsRole = rlsRoleAvailable ?? await probeRlsRole()
  const client: PoolClient = await pool.connect()
  try {
    await client.query('BEGIN')
    if (useRlsRole) await client.query(`SET LOCAL ROLE ${quoteIdent(RLS_ROLE)}`)
    await client.query(`SET LOCAL "app.current_tenant" = '${tenantId}'`)
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
