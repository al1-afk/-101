/**
 * Envoie 1 email de test via le même SMTP qu'utilise l'Autopilot.
 * Usage :
 *   node scripts/test-send-one-email.mjs <destinataire@exemple.com>
 */
import { readFileSync } from 'node:fs'
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const to = process.argv[2]
if (!to || !to.includes('@')) {
  console.error('Usage: node scripts/test-send-one-email.mjs <destinataire@exemple.com>')
  process.exit(1)
}

const { sendEmail } = await import('../server/lib/email.ts')

const now = new Date().toLocaleString('fr-FR')
const subject = `Test Autopilot NEXT GITAL — ${now}`
const bodyText = `Bonjour,

Ceci est un test d'envoi depuis le module Autopilot Outbound de NEXT GITAL.

Si vous recevez ce message :
  ✓ dans votre boîte de réception → SMTP + DNS OK
  ⚠ dans Spam                     → SPF/DKIM OK mais DMARC manque
  ✗ non reçu (bounce)             → problème SMTP à diagnostiquer

Merci de vérifier également les en-têtes de ce message :
  Gmail → clic sur les 3 points → "Afficher l'original"
  Chercher : DKIM=pass, SPF=pass, DMARC=pass|none|fail

— L'équipe NEXT GITAL
Envoyé automatiquement à ${to}
${now}`

const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;padding:24px;background:#f5f7fb;">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
    <h2 style="color:#0369a1;margin-top:0">Test Autopilot NEXT GITAL</h2>
    <p>Bonjour,</p>
    <p>Ceci est un test d'envoi depuis le module <b>Autopilot Outbound</b>.</p>
    <ul>
      <li>✓ Dans <b>Inbox</b> → SMTP + DNS parfaits</li>
      <li>⚠ Dans <b>Spam</b> → SPF/DKIM OK mais DMARC manque</li>
      <li>✗ Bounce → problème SMTP à diagnostiquer</li>
    </ul>
    <p style="color:#64748b;font-size:12px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px">
      Envoyé le ${now} · destinataire ${to}
    </p>
  </div>
</body></html>`

console.log(`\n▶ Envoi vers ${to}…\n`)
const t0 = Date.now()
try {
  await sendEmail({ to, subject, html, text: bodyText })
  console.log(`\n✓ Envoi accepté par SMTP en ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log('   → Vérifie ta boîte + le dossier Spam dans 1-2 minutes')
} catch (e) {
  console.error(`\n✗ Échec : ${e?.message ?? e}`)
  process.exit(1)
}
process.exit(0)
