/**
 * Notifications email — déclenchées par les événements clés du CRM.
 *
 * Appelées en post-hook dans server/routes/crud.ts après les POST/PATCH
 * sur certaines tables. Silencieuses si RESEND_API_KEY manquante.
 *
 * Destinataires : tous les admins du tenant concerné.
 */
import { sendEmail } from './email'
import { tenantQuery } from '../db/pool'

const BRAND = '<strong style="color:#1d4ed8;">NEXT GITAL</strong>'

const layout = (titleText: string, bodyHtml: string) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Inter,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,0.06);overflow:hidden;">
        <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#eff6ff,#fff);border-bottom:1px solid #e2e8f0;">
          <h1 style="margin:0;font-size:16px;color:#0f172a;">${titleText}</h1>
        </td></tr>
        <tr><td style="padding:24px 32px;font-size:14px;color:#334155;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="padding:14px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">${BRAND} — CRM &amp; Gestion · Notification automatique</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

interface DispatchOpts {
  tenantId: string
  subject:  string
  title:    string
  bodyHtml: string
}

/** Récupère tous les admins du tenant et envoie l'email à chacun. */
async function dispatchToAdmins({ tenantId, subject, title, bodyHtml }: DispatchOpts): Promise<void> {
  try {
    const admins = await tenantQuery<{ email: string }>(
      tenantId,
      `SELECT u.email
         FROM public.tenant_users tu
         JOIN public.users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $1 AND tu.role = 'admin' AND u.email IS NOT NULL`,
      [tenantId],
    )
    console.log(`[notifEmail] dispatching "${subject}" to ${admins.length} admin(s): ${admins.map(a => a.email).join(', ')}`)
    if (!admins.length) return
    const html = layout(title, bodyHtml)
    const results = await Promise.allSettled(
      admins.map(a => sendEmail({ to: a.email, subject, html, text: title })),
    )
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[notifEmail] FAILED to ${admins[i].email}:`, r.reason?.message ?? r.reason)
      } else {
        console.log(`[notifEmail] ✅ sent to ${admins[i].email}`)
      }
    })
  } catch (err: any) {
    console.error('[notifEmail] dispatch failed:', err?.message)
  }
}

/* ───── Templates par événement ───────────────────────────────────── */

export async function notifyNewProspect(tenantId: string, prospect: { nom: string; entreprise?: string | null; valeur_estimee?: number | null }) {
  const lines = [
    `<p>Un nouveau prospect vient d'être ajouté au CRM :</p>`,
    `<ul style="padding-left:18px;margin:8px 0;">`,
    `<li><strong>Nom :</strong> ${escape(prospect.nom)}</li>`,
    prospect.entreprise ? `<li><strong>Entreprise :</strong> ${escape(prospect.entreprise)}</li>` : '',
    prospect.valeur_estimee ? `<li><strong>Valeur estimée :</strong> ${prospect.valeur_estimee.toLocaleString('fr-FR')} MAD</li>` : '',
    `</ul>`,
  ].filter(Boolean).join('')
  await dispatchToAdmins({
    tenantId,
    subject: `101/ 🆕 Nouveau prospect : ${prospect.nom}`,
    title:   `🆕 Nouveau prospect`,
    bodyHtml: lines,
  })
}

export async function notifyTaskValidation(tenantId: string, task: { title: string; project_id?: string | null }) {
  const lines = `
    <p>Une tâche vient d'être terminée par un membre de l'équipe et attend votre validation :</p>
    <p style="padding:12px;background:#fef3c7;border-radius:8px;border:1px solid #fde68a;">
      ⚑ <strong>${escape(task.title)}</strong>
    </p>
    <p style="font-size:13px;color:#64748b;">Ouvrez le projet pour valider ou renvoyer la tâche en correction.</p>
  `
  await dispatchToAdmins({
    tenantId,
    subject: `101/ ⚑ Tâche à valider : ${task.title}`,
    title:   `⚑ Tâche à valider`,
    bodyHtml: lines,
  })
}

export async function notifyNewPaiement(tenantId: string, paiement: { montant: number; mode?: string | null; client_nom?: string | null }) {
  const lines = `
    <p>Un paiement a été enregistré :</p>
    <p style="padding:12px;background:#d1fae5;border-radius:8px;border:1px solid #6ee7b7;font-size:18px;">
      💰 <strong>${paiement.montant.toLocaleString('fr-FR')} MAD</strong>${paiement.mode ? ` · ${escape(paiement.mode)}` : ''}
    </p>
    ${paiement.client_nom ? `<p>Client : <strong>${escape(paiement.client_nom)}</strong></p>` : ''}
  `
  await dispatchToAdmins({
    tenantId,
    subject: `101/ 💰 Paiement reçu : ${paiement.montant.toLocaleString('fr-FR')} MAD`,
    title:   `💰 Paiement reçu`,
    bodyHtml: lines,
  })
}

export async function notifyDevisAccepte(tenantId: string, devis: { numero: string; client_nom?: string | null; montant_ttc?: number | null }) {
  const lines = `
    <p>Un devis vient d'être accepté par le client :</p>
    <p style="padding:12px;background:#dbeafe;border-radius:8px;border:1px solid #93c5fd;">
      ✅ <strong>${escape(devis.numero)}</strong>${devis.client_nom ? ` — ${escape(devis.client_nom)}` : ''}
      ${devis.montant_ttc ? `<br/><span style="font-size:16px;color:#1d4ed8;font-weight:700;">${devis.montant_ttc.toLocaleString('fr-FR')} MAD</span>` : ''}
    </p>
  `
  await dispatchToAdmins({
    tenantId,
    subject: `101/ ✅ Devis accepté : ${devis.numero}`,
    title:   `✅ Devis accepté`,
    bodyHtml: lines,
  })
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ───── RAPPELS d'expiration (domaines / hébergements) ───────────── */

interface ExpiringItem {
  id:              string
  nom:             string            // nom du domaine ou de l'hébergement
  client_nom:      string | null
  date_expiration: string            // YYYY-MM-DD
  prix_annuel:     number | null
  days:            number            // jours restants (négatif si expiré)
}

function expiryColor(days: number): string {
  if (days < 0) return '#dc2626'   // rouge : expiré
  if (days <= 7) return '#dc2626'   // rouge : urgent
  if (days <= 30) return '#d97706'  // orange : bientôt
  return '#2563eb'                  // bleu : à venir
}

function formatExpiryMessage(days: number): string {
  if (days < 0)  return `expiré depuis ${Math.abs(days)} jour${Math.abs(days) > 1 ? 's' : ''}`
  if (days === 0) return `expire aujourd'hui`
  if (days === 1) return `expire demain`
  return `expire dans ${days} jours`
}

export async function notifyExpiryReminder(
  tenantId: string,
  kind: 'domaine' | 'hebergement',
  item: ExpiringItem,
): Promise<void> {
  const icon  = kind === 'domaine' ? '🌐' : '🖥️'
  const label = kind === 'domaine' ? 'Domaine' : 'Hébergement'
  const msg   = formatExpiryMessage(item.days)
  const color = expiryColor(item.days)
  const lines = `
    <p>${label} <strong>${escape(item.nom)}</strong> ${msg}.</p>
    <p style="padding:12px;background:${color}15;border-radius:8px;border:1px solid ${color}40;">
      ${icon} <strong>${escape(item.nom)}</strong>
      ${item.client_nom ? `<br/>Client : <strong>${escape(item.client_nom)}</strong>` : ''}
      <br/>Date d'expiration : <strong style="color:${color};">${item.date_expiration}</strong> (${msg})
      ${item.prix_annuel ? `<br/>Prix annuel : <strong>${item.prix_annuel.toLocaleString('fr-FR')} MAD</strong>` : ''}
    </p>
    <p style="font-size:13px;color:#64748b;">⚠️ Pense à procéder au renouvellement pour éviter toute coupure de service.</p>
  `
  await dispatchToAdmins({
    tenantId,
    subject: `101/ ${icon} Rappel ${label.toLowerCase()} : ${item.nom} ${msg}`,
    title:   `${icon} Rappel d'expiration ${label.toLowerCase()}`,
    bodyHtml: lines,
  })
}
