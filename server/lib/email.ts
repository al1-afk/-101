/**
 * Email sender — Resend HTTPS API
 *
 * Configuration (.env.local):
 *   RESEND_API_KEY=re_...
 *   RESEND_FROM=NEXT GITAL <noreply@101.nextgital.tech>
 *
 * If RESEND_API_KEY is missing, falls back to console.log so dev still
 * works without a configured provider.
 */

export interface EmailAttachment {
  filename: string
  /** Contenu base64 (sans data URI prefix). */
  content:  string
}

interface SendOpts {
  to:          string
  subject:     string
  html:        string
  text?:       string
  attachments?: EmailAttachment[]
}

export async function sendEmail({ to, subject, html, text, attachments }: SendOpts): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.RESEND_FROM || 'NEXT GITAL <noreply@101.nextgital.tech>'

  if (!apiKey) {
    const isProd = process.env.NODE_ENV === 'production'
    if (isProd) {
      console.error('\n⚠️  [email] RESEND_API_KEY missing in PRODUCTION — emails are NOT being sent. Set it in your server env and restart.\n')
    }
    const attInfo = attachments?.length ? ` (+${attachments.length} attachment${attachments.length > 1 ? 's' : ''})` : ''
    console.log(`\n[email:dev] to=${to} subject="${subject}"${attInfo}\n${text ?? html}\n`)
    return
  }

  const body: Record<string, unknown> = { from, to, subject, html, text }
  if (attachments?.length) body.attachments = attachments

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${detail}`)
  }
}

/* ─── Templates ─────────────────────────────────────────────────── */

export function loginCodeEmail(code: string): { subject: string; html: string; text: string } {
  const subject = `${code} — Code de connexion NEXT GITAL`
  const text    = [
    `Votre code de connexion NEXT GITAL : ${code}`,
    ``,
    `Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette connexion, ignorez ce message.`,
    ``,
    `— NEXT GITAL`,
  ].join('\n')

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Inter,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,0.06);overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;text-align:center;">
          <div style="display:inline-block;width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;font-weight:800;font-size:20px;line-height:48px;text-align:center;">G</div>
          <h1 style="margin:16px 0 4px;font-size:18px;color:#0f172a;">Confirmation de connexion</h1>
          <p style="margin:0;font-size:14px;color:#64748b;">Entrez ce code dans NEXT GITAL pour finaliser votre connexion.</p>
        </td></tr>
        <tr><td style="padding:24px 32px;text-align:center;">
          <div style="display:inline-block;padding:18px 28px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;font-size:32px;letter-spacing:8px;font-weight:800;color:#1d4ed8;font-family:monospace;">${code}</div>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">Ce code expire dans <strong style="color:#0f172a;">10 minutes</strong>. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message — votre compte reste sécurisé.</p>
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">NEXT GITAL — CRM &amp; Gestion · Ne répondez pas à ce message</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  return { subject, html, text }
}

export function passwordResetEmail(code: string): { subject: string; html: string; text: string } {
  const subject = `${code} — Réinitialisation de votre mot de passe NEXT GITAL`
  const text    = [
    `Code de réinitialisation : ${code}`,
    ``,
    `Ce code expire dans 10 minutes. Si vous n'avez pas demandé cette réinitialisation, ignorez ce message.`,
    ``,
    `— NEXT GITAL`,
  ].join('\n')

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Inter,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,0.06);overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;text-align:center;">
          <div style="display:inline-block;width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;font-weight:800;font-size:20px;line-height:48px;text-align:center;">G</div>
          <h1 style="margin:16px 0 4px;font-size:18px;color:#0f172a;">Réinitialisation de mot de passe</h1>
          <p style="margin:0;font-size:14px;color:#64748b;">Utilisez ce code pour définir un nouveau mot de passe.</p>
        </td></tr>
        <tr><td style="padding:24px 32px;text-align:center;">
          <div style="display:inline-block;padding:18px 28px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;font-size:32px;letter-spacing:8px;font-weight:800;color:#1d4ed8;font-family:monospace;">${code}</div>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">Ce code expire dans <strong style="color:#0f172a;">10 minutes</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez ce message — votre mot de passe actuel reste valide.</p>
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">NEXT GITAL — CRM &amp; Gestion · Ne répondez pas à ce message</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  return { subject, html, text }
}
