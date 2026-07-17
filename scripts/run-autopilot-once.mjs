/**
 * Déclenche un run Autopilot pour un tenant donné (test / dev uniquement).
 *
 * Usage :
 *   node scripts/run-autopilot-once.mjs <tenant_id>
 *
 * Charge .env.local, importe l'orchestrateur, lance le run.
 */
import { readFileSync } from 'node:fs'

try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const tenantId = process.argv[2]
if (!tenantId) {
  console.error('Usage: node scripts/run-autopilot-once.mjs <tenant_id>')
  process.exit(1)
}

/* Chargement dynamique — tsx transpile TS à la volée. */
const { pool } = await import('../server/db/pool.ts')
const { runAutopilotForTenantId } = await import('../server/lib/outboundAutopilot.ts')

console.log(`\n▶ Lancement run Autopilot pour tenant ${tenantId}…\n`)
const t0 = Date.now()
const result = await runAutopilotForTenantId(pool, tenantId)
console.log(`\n✓ Run terminé en ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log(`  run_id: ${result.run_id}`)

await pool.end()
process.exit(0)
