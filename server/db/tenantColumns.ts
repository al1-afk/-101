/**
 * Introspection : quelles tables portent une colonne `tenant_id` ?
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────
 * Le cloisonnement multi-tenant reposait sur UNE seule ligne de défense :
 * les politiques RLS de PostgreSQL, activées via `SET LOCAL
 * app.current_tenant` dans `tenantQuery`. Les requêtes CRUD génériques
 * s'écrivaient `SELECT * FROM <table>` sans aucun filtre applicatif.
 *
 * Or RLS ne s'applique pas :
 *   - à un rôle SUPERUSER ou BYPASSRLS (cas constaté en développement :
 *     un tenant voyait 104 clients d'autres espaces) ;
 *   - au PROPRIÉTAIRE d'une table dont la RLS est activée sans `FORCE`.
 *
 * Une erreur de configuration de rôle, de GRANT ou de propriétaire
 * suffisait donc à exposer toutes les données de tous les espaces.
 * Le filtre `tenant_id = $n` ajouté côté applicatif (crud.ts) constitue
 * une seconde ligne de défense indépendante de la configuration de la
 * base. Les deux couches restent actives : RLS d'abord, filtre ensuite.
 *
 * Ce module dit à quelles tables le filtre peut s'appliquer — une table
 * sans colonne `tenant_id` (table de référence globale) ne doit pas
 * recevoir de clause qui échouerait en SQL.
 */
import { query } from './pool'
import { logger } from '../lib/logger'

let cache: Set<string> | null = null
let loading: Promise<Set<string>> | null = null

/**
 * Charge (une fois) la liste des tables publiques possédant `tenant_id`.
 * Idempotent et concurrent-safe : les appels simultanés partagent la
 * même promesse.
 */
export async function ensureTenantColumnCache(): Promise<Set<string>> {
  if (cache) return cache
  if (loading) return loading
  loading = (async () => {
    const rows = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'tenant_id'`
    )
    cache = new Set(rows.map(r => r.table_name))
    return cache
  })().finally(() => { loading = null })
  return loading
}

/**
 * La table doit-elle être filtrée par `tenant_id` ?
 *
 * Si le cache n'est pas encore chargé, on répond `false` — l'appelant
 * doit avoir attendu `ensureTenantColumnCache()` au préalable. C'est le
 * cas dans crud.ts. La RLS reste active dans tous les cas.
 */
export function tableIsTenantScoped(table: string): boolean {
  return cache?.has(table) ?? false
}

/**
 * Diagnostic de démarrage : signale les tables exposées par l'API CRUD
 * qui n'ont PAS de colonne tenant_id. Elles ne bénéficieront que de la
 * RLS — il faut le savoir explicitement plutôt que de le découvrir lors
 * d'un incident.
 */
export async function reportUnscopedTables(exposedTables: Iterable<string>): Promise<string[]> {
  const scoped = await ensureTenantColumnCache()
  const existing = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  )
  const present = new Set(existing.map(r => r.table_name))
  const unscoped = [...exposedTables].filter(t => present.has(t) && !scoped.has(t))
  if (unscoped.length) {
    logger.warn(
      '[tenant-scope] tables exposées SANS colonne tenant_id — protégées par la seule RLS :',
      unscoped.join(', ')
    )
  }
  return unscoped
}

/** Réinitialise le cache (tests, ou après une migration de schéma). */
export function resetTenantColumnCache(): void {
  cache = null
}
