/**
 * Team-related email templates.
 *
 * - teamInvitationEmail   : sent when an admin creates a member
 * - teamPasswordResetEmail: sent when admin triggers a password reset
 */

const CATEGORY_LABELS: Record<string, string> = {
  whatsapp:          'Scripts WhatsApp',
  quick:             'Réponses rapides',
  sales:             'Process Commercial',
  onboarding:        'Onboarding Client',
  delivery:          'Livraison Projet',
  support:           'Support Client',
  marketing:         'Marketing & Ads',
  faq:               'FAQ Interne',
  ai:                'IA & Automatisation',
  projets:           'Chef de projet',
  dev:               'Développeur',
  media_buyer:       'Media Buyer',
  prospection:       'Prospection',
  designer:          'Designer / Graphiste',
  commercial:        'Commercial',
  community_manager: 'Community Manager',
}

interface InviteOpts {
  firstName:     string
  inviterName:   string
  tenantName:    string
  jobTitle:      string
  inviteUrl:     string
  sopCategories: string[]
}

export function teamInvitationEmail(opts: InviteOpts) {
  const { firstName, inviterName, tenantName, jobTitle, inviteUrl, sopCategories } = opts
  const subject = `Bienvenue dans l'équipe ${tenantName} — votre accès NEXT GITAL`

  const categoryList = sopCategories
    .map(c => `• ${CATEGORY_LABELS[c] ?? c}`)
    .join('\n')

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `${inviterName} vous a ajouté(e) à l'équipe ${tenantName} sur NEXT GITAL.`,
    jobTitle ? `Votre poste : ${jobTitle}` : '',
    sopCategories.length ? `Votre accès SOPs :\n${categoryList}` : '',
    ``,
    `Pour créer votre mot de passe et accéder à votre espace personnel, cliquez ci-dessous :`,
    inviteUrl,
    ``,
    `Ce lien est valable 7 jours.`,
    ``,
    `Une fois connecté(e), vous trouverez :`,
    `• Vos SOPs et procédures de travail`,
    `• Vos tâches assignées`,
    `• Votre progression`,
    ``,
    `À bientôt,`,
    `L'équipe ${tenantName}`,
  ].filter(Boolean).join('\n')

  const categoryHtml = sopCategories.length
    ? `<div style="margin:12px 0;padding:14px 16px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;">
         <div style="font-size:13px;font-weight:600;color:#1e40af;margin-bottom:6px;">Accès SOPs :</div>
         <div style="font-size:13px;color:#1e3a8a;line-height:1.7;">
           ${sopCategories.map(c => `• ${CATEGORY_LABELS[c] ?? c}`).join('<br/>')}
         </div>
       </div>`
    : ''

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Inter,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,0.06);overflow:hidden;">
        <tr><td style="padding:32px 32px 12px;text-align:center;">
          <div style="display:inline-block;width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;font-weight:800;font-size:22px;line-height:52px;text-align:center;">G</div>
          <h1 style="margin:18px 0 6px;font-size:20px;color:#0f172a;">Bienvenue dans l'équipe ${tenantName}</h1>
          <p style="margin:0;font-size:14px;color:#64748b;">${inviterName} vous a invité(e) à rejoindre NEXT GITAL.</p>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <p style="margin:18px 0 0;font-size:15px;color:#0f172a;line-height:1.6;">Bonjour <strong>${firstName}</strong>,</p>
          ${jobTitle ? `<p style="margin:8px 0 0;font-size:14px;color:#475569;">Votre poste : <strong>${jobTitle}</strong></p>` : ''}
          ${categoryHtml}
          <p style="margin:18px 0 0;font-size:14px;color:#475569;line-height:1.6;">Cliquez ci-dessous pour créer votre mot de passe et accéder à votre espace personnel :</p>
        </td></tr>
        <tr><td style="padding:20px 32px 8px;text-align:center;">
          <a href="${inviteUrl}" style="display:inline-block;padding:14px 28px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;font-weight:700;font-size:15px;text-decoration:none;">
            Créer mon accès →
          </a>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;">
          <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;text-align:center;">
            Ce lien est valable <strong>7 jours</strong>. Si vous n'attendiez pas cet email, ignorez-le simplement.
          </p>
          <p style="margin:18px 0 0;font-size:13px;color:#64748b;line-height:1.6;">Une fois connecté(e), vous trouverez vos <strong>SOPs</strong>, vos <strong>tâches</strong> et votre <strong>progression</strong> sur votre espace personnel.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">NEXT GITAL — Gestion d'équipe · Ne répondez pas à ce message</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  return { subject, html, text }
}

interface ResetOpts {
  firstName: string
  resetUrl:  string
}

export function teamPasswordResetEmail(opts: ResetOpts) {
  const { firstName, resetUrl } = opts
  const subject = `Réinitialisation de votre mot de passe NEXT GITAL`

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `Votre administrateur a déclenché une réinitialisation de votre mot de passe NEXT GITAL.`,
    ``,
    `Pour définir un nouveau mot de passe, cliquez ci-dessous :`,
    resetUrl,
    ``,
    `Ce lien est valable 24 heures.`,
    ``,
    `Si vous n'êtes pas à l'origine de cette demande, contactez votre administrateur.`,
  ].join('\n')

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Inter,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,0.06);overflow:hidden;">
        <tr><td style="padding:32px 32px 12px;text-align:center;">
          <div style="display:inline-block;width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;font-weight:800;font-size:22px;line-height:52px;text-align:center;">⚿</div>
          <h1 style="margin:18px 0 6px;font-size:20px;color:#0f172a;">Réinitialisation de mot de passe</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <p style="margin:18px 0 0;font-size:15px;color:#0f172a;line-height:1.6;">Bonjour <strong>${firstName}</strong>,</p>
          <p style="margin:14px 0 0;font-size:14px;color:#475569;line-height:1.6;">Votre administrateur a déclenché la réinitialisation de votre mot de passe. Définissez un nouveau mot de passe en cliquant ci-dessous :</p>
        </td></tr>
        <tr><td style="padding:20px 32px 8px;text-align:center;">
          <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;font-weight:700;font-size:15px;text-decoration:none;">
            Définir mon nouveau mot de passe →
          </a>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;">
          <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;text-align:center;">
            Ce lien est valable <strong>24 heures</strong>.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">NEXT GITAL — Gestion d'équipe · Ne répondez pas à ce message</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  return { subject, html, text }
}
