/**
 * Template HTML pour les emails Outbound (prospection).
 *
 * Design : sobre, professionnel, compatible tous clients mail
 * (Gmail, Outlook, Apple Mail, Yahoo). On utilise du HTML tables +
 * inline CSS car les clients mail ignorent <style> global.
 *
 * Le pied de page contient un lien de désabonnement (RGPD +
 * bonne pratique deliverability). L'URL pointe vers le tenant.
 */

export interface OutboundEmailOpts {
  bodyText:      string
  sender: {
    name:      string
    role?:     string
    company:   string
    email:     string
    phone?:    string
    website?:  string
    logo_url?: string
  }
  unsubscribeUrl?: string
  /** Adresse envoyée pour le token unique dans le lien unsubscribe. */
  prospectEmail?: string
}

const BRAND_COLOR = '#4F46E5'  /* indigo-600 — cohérent avec le reste de l'app */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function paragraphs(text: string): string {
  return text
    .split(/\n\n+/)
    .map(p => `<p style="margin:0 0 16px;line-height:1.6;color:#374151;font-size:15px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function buildOutboundEmailHtml(opts: OutboundEmailOpts): string {
  const { sender, unsubscribeUrl, prospectEmail } = opts

  const initials = sender.company
    .split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'N'

  const logo = sender.logo_url
    ? `<img src="${escapeHtml(sender.logo_url)}" alt="${escapeHtml(sender.company)}" width="40" height="40" style="border-radius:10px;display:block;">`
    : `<div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,${BRAND_COLOR},#7C3AED);color:#ffffff;font-weight:700;font-size:16px;line-height:40px;text-align:center;">${escapeHtml(initials)}</div>`

  const contactRows: string[] = []
  if (sender.phone) {
    contactRows.push(
      `<a href="tel:${escapeHtml(sender.phone)}" style="color:#6B7280;text-decoration:none;font-size:13px;">📞 ${escapeHtml(sender.phone)}</a>`
    )
  }
  contactRows.push(
    `<a href="mailto:${escapeHtml(sender.email)}" style="color:#6B7280;text-decoration:none;font-size:13px;">✉ ${escapeHtml(sender.email)}</a>`
  )
  if (sender.website) {
    const url = sender.website.startsWith('http') ? sender.website : `https://${sender.website}`
    const display = sender.website.replace(/^https?:\/\//, '')
    contactRows.push(
      `<a href="${escapeHtml(url)}" style="color:${BRAND_COLOR};text-decoration:none;font-size:13px;font-weight:600;">🌐 ${escapeHtml(display)}</a>`
    )
  }

  const unsubBlock = unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-size:11px;color:#9CA3AF;line-height:1.5;">
         Cet email est envoyé dans le cadre d'une démarche commerciale. Si vous ne souhaitez plus être contacté,
         <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9CA3AF;text-decoration:underline;">cliquez ici pour vous désinscrire</a>.
       </p>`
    : ''

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(sender.company)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F4F6;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="padding:24px 32px 8px;border-bottom:1px solid #F3F4F6;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="40" valign="middle" style="padding-right:12px;">${logo}</td>
                  <td valign="middle">
                    <div style="font-size:15px;font-weight:700;color:#111827;line-height:1.2;">${escapeHtml(sender.company)}</div>
                    ${sender.role ? `<div style="font-size:12px;color:#6B7280;line-height:1.3;margin-top:2px;">${escapeHtml(sender.role)}</div>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 32px 8px;">
              ${paragraphs(opts.bodyText)}
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding:8px 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #F3F4F6;padding-top:16px;">
                <tr>
                  <td>
                    <div style="font-size:14px;font-weight:600;color:#111827;line-height:1.3;">${escapeHtml(sender.name)}</div>
                    ${sender.role ? `<div style="font-size:12px;color:#6B7280;line-height:1.3;margin-top:2px;">${escapeHtml(sender.role)} · ${escapeHtml(sender.company)}</div>` : `<div style="font-size:12px;color:#6B7280;line-height:1.3;margin-top:2px;">${escapeHtml(sender.company)}</div>`}
                    <div style="margin-top:10px;">
                      ${contactRows.map(r => `<div style="margin-bottom:4px;">${r}</div>`).join('')}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 20px;background:#F9FAFB;border-top:1px solid #F3F4F6;">
              <p style="margin:0;font-size:11px;color:#9CA3AF;line-height:1.5;text-align:center;">
                Envoyé par ${escapeHtml(sender.company)}${prospectEmail ? ` à ${escapeHtml(prospectEmail)}` : ''}
              </p>
              ${unsubBlock}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
