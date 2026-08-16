/**
 * Génère les 4 rapports automatiques d'un espace SANS rien envoyer.
 *
 * Usage :
 *   npx tsx scripts/preview-reports.mjs <tenant_slug|tenant_id> [dossier_sortie]
 *
 * Écrit un fichier .html par type de rapport (ouvrable dans le navigateur)
 * et affiche le sujet + les compteurs. Sert à vérifier le contenu avant
 * d'activer les envois, ou après un changement de règle métier.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* pas de .env.local — on utilise l'environnement courant */ }

const target = process.argv[2]
const outDir = process.argv[3] ?? '/tmp/rapports-101'
if (!target) {
  console.error('Usage: npx tsx scripts/preview-reports.mjs <tenant_slug|tenant_id> [dossier_sortie]')
  process.exit(1)
}

const { pool } = await import('../server/db/pool.ts')
const { buildReport, loadTenantTick, REPORT_KINDS, KIND_LABELS } = await import('../server/lib/reportScheduler.ts')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let tenantId = target
if (!UUID_RE.test(target)) {
  const { rows } = await pool.query('SELECT id FROM tenants WHERE slug = $1', [target])
  if (!rows[0]) { console.error(`Espace introuvable : ${target}`); process.exit(1) }
  tenantId = rows[0].id
}

const tenant = await loadTenantTick(pool, tenantId)
if (!tenant) {
  console.error('Aucune configuration de notifications pour cet espace (migration 086 appliquée ?).')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
console.log(`\nEspace : ${tenant.tenant_name} (${tenant.tenant_slug})`)
console.log(`Heure locale : ${tenant.local_date} ${String(tenant.local_hour).padStart(2, '0')}h · jour ISO ${tenant.local_dow}\n`)

for (const kind of REPORT_KINDS) {
  const t0 = Date.now()
  const report = await buildReport(pool, tenant, kind)
  const file = `${outDir}/${kind}.html`
  writeFileSync(file, report.html)
  console.log(`▸ ${KIND_LABELS[kind]}`)
  console.log(`  sujet   : ${report.subject}`)
  console.log(`  envoyé  : ${report.empty ? 'non (rien à signaler)' : 'oui'}`)
  console.log(`  chiffres: ${JSON.stringify(report.summary)}`)
  console.log(`  fichier : ${file}  (${Date.now() - t0} ms)\n`)
}

await pool.end()
process.exit(0)
