/**
 * Test end-to-end du tracking :
 *  1. Sélectionne un prospect Autopilot avec email
 *  2. Envoie un email de test AVEC tracking pixel + wrap links
 *  3. Simule l'ouverture (fetch du pixel)
 *  4. Simule un clic (fetch du redirect)
 *  5. Affiche les stats du prospect
 */
import { readFileSync } from 'node:fs'
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

process.env.PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:4001'

const { pool } = await import('../server/db/pool.ts')
const { sendEmail } = await import('../server/lib/email.ts')
const { buildOutboundEmailHtml } = await import('../server/lib/outboundEmailTemplate.ts')
const { openPixelUrl, clickWrapUrl } = await import('../server/lib/emailTracking.ts')

const to = process.argv[2]
if (!to) { console.error('Usage: node scripts/test-tracking.mjs <email>'); process.exit(1) }

/* 1. Choisir un prospect (le premier avec email non-null) */
const { rows } = await pool.query(`
  SELECT id, entreprise, email FROM outbound_prospects
   WHERE email IS NOT NULL ORDER BY created_at DESC LIMIT 1
`)
const prospect = rows[0]
if (!prospect) { console.error('Aucun prospect avec email. Lance d\'abord un Autopilot.'); process.exit(1) }

console.log(`▶ Prospect : ${prospect.entreprise} (${prospect.id})`)
console.log(`▶ Envoi vers : ${to}\n`)

const pixel = openPixelUrl(prospect.id)
const wrap  = (u) => clickWrapUrl(prospect.id, u)
console.log(`  Pixel URL : ${pixel}`)
console.log(`  Click URL : ${wrap('https://nextgital.com')}\n`)

/* 2. Envoi */
const html = buildOutboundEmailHtml({
  bodyText: `Bonjour ${prospect.entreprise},

Test de tracking. Clique ici pour vérifier : https://nextgital.com

Merci.`,
  sender: {
    name: 'L\'équipe NEXT GITAL', role: 'Direction commerciale',
    company: 'NEXT GITAL', email: 'info@nextgital.com',
    phones: ['+212 6 20 00 20 66'], website: 'nextgital.com',
    logo_url: 'http://localhost:5173/logo-nextgital.png',
  },
  prospectEmail: to,
  tracking: { openPixelUrl: pixel, wrapClickUrl: wrap },
})

await sendEmail({ to, subject: `Test Tracking ${new Date().toLocaleTimeString('fr-FR')}`, html })
console.log('✓ Email envoyé\n')

/* 3. Simule ouverture (fetch pixel) */
console.log('▶ Simulation d\'ouverture (fetch pixel)…')
const openRes = await fetch(pixel, { headers: { 'user-agent': 'TestScript/1.0' } })
console.log(`  ${openRes.status} ${openRes.headers.get('content-type')} (${openRes.headers.get('content-length')} bytes)`)

/* 4. Simule clic */
console.log('▶ Simulation d\'un clic…')
const clickRes = await fetch(wrap('https://nextgital.com'), { redirect: 'manual', headers: { 'user-agent': 'TestScript/1.0' } })
console.log(`  ${clickRes.status} → ${clickRes.headers.get('location')}`)

/* 5. Vérifier stats DB */
await new Promise(r => setTimeout(r, 500))
const { rows: stats } = await pool.query(`
  SELECT email_opened_at, email_opened_count, email_clicked_at, email_clicked_count
    FROM outbound_prospects WHERE id = $1
`, [prospect.id])
console.log('\n▶ Stats DB après tracking :')
console.log(`  opened_at    : ${stats[0].email_opened_at}`)
console.log(`  opened_count : ${stats[0].email_opened_count}`)
console.log(`  clicked_at   : ${stats[0].email_clicked_at}`)
console.log(`  clicked_count: ${stats[0].email_clicked_count}`)

const { rows: events } = await pool.query(`
  SELECT event_type, target_url, created_at FROM outbound_email_events
   WHERE prospect_id = $1 ORDER BY created_at DESC LIMIT 5
`, [prospect.id])
console.log('\n▶ Events récents :')
events.forEach(e => console.log(`  [${e.event_type}] ${e.target_url ?? ''} @ ${e.created_at.toLocaleString('fr-FR')}`))

await pool.end()
process.exit(0)
