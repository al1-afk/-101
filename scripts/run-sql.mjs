#!/usr/bin/env node
/**
 * scripts/run-sql.mjs — exécute un fichier SQL sur la base courante.
 *
 * Utilisation :
 *   node scripts/run-sql.mjs <chemin-fichier.sql>
 *   node scripts/run-sql.mjs scripts/sync-clients-prod.sql
 *
 * Lit .env.local (ou variables POSTGRES_* dans le container Dokploy).
 * Affiche le nombre de UPDATEs qui vont s'exécuter et demande confirmation
 * si stdin est un TTY. En pipe / CI, s'exécute directement.
 *
 * Pour un dry-run (voir combien de lignes seraient touchées sans écrire) :
 *   node scripts/run-sql.mjs <fichier.sql> --dry
 */
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import pg from 'pg'

/* charge .env.local sans dépendance externe */
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* pas de .env.local, on continue */ }

const [, , filePath, ...flags] = process.argv
const dryRun = flags.includes('--dry')

if (!filePath) {
  console.error('\nUsage : node scripts/run-sql.mjs <fichier.sql> [--dry]\n')
  process.exit(1)
}

const sql = readFileSync(filePath, 'utf8')
const nbUpdates = (sql.match(/^\s*UPDATE\s/gim) ?? []).length
const nbInserts = (sql.match(/^\s*INSERT\s/gim) ?? []).length
const nbDeletes = (sql.match(/^\s*DELETE\s/gim) ?? []).length

console.log(`\n📄 Fichier : ${filePath}`)
console.log(`   UPDATE : ${nbUpdates}`)
console.log(`   INSERT : ${nbInserts}`)
console.log(`   DELETE : ${nbDeletes}`)
if (dryRun) {
  console.log(`\n[dry-run] Aucune modification appliquée. Fais tourner sans --dry pour exécuter.\n`)
  process.exit(0)
}

async function confirm() {
  if (!process.stdin.isTTY) return true /* non-interactif → OK */
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(`\nContinuer ? [y/N] : `, ans => {
    rl.close()
    res(ans.trim().toLowerCase() === 'y')
  }))
}

if (!(await confirm())) {
  console.log('Annulé.')
  process.exit(0)
}

const pool = new pg.Pool({
  host:     process.env.PG_HOST     || process.env.POSTGRES_HOST     || 'localhost',
  port:     Number(process.env.PG_PORT || process.env.POSTGRES_PORT || 5432),
  database: process.env.PG_DATABASE || process.env.POSTGRES_DB       || 'postgres',
  user:     process.env.PG_USER     || process.env.POSTGRES_USER     || 'postgres',
  password: process.env.PG_PASSWORD || process.env.POSTGRES_PASSWORD || '',
})

const client = await pool.connect()
try {
  const started = Date.now()
  const result = await client.query(sql)
  const elapsed = Date.now() - started
  const stats = Array.isArray(result)
    ? result.reduce((acc, r) => acc + (r.rowCount ?? 0), 0)
    : (result.rowCount ?? 0)
  console.log(`\n✅ Exécuté en ${elapsed}ms — ${stats} ligne(s) affectée(s) au total.\n`)
} catch (err) {
  console.error(`\n❌ Erreur : ${err.message}\n`)
  console.error(`   La transaction a été annulée. Aucune modification appliquée.\n`)
  process.exit(2)
} finally {
  client.release()
  await pool.end()
}
