/**
 * POST /api/send-document
 *
 * Envoie un document PDF (facture, devis, reçu) au client par email.
 * Le PDF est généré côté frontend (jsPDF) puis uploadé ici en base64 —
 * évite de dupliquer le rendu PDF côté serveur.
 *
 * Le déclencheur est TOUJOURS manuel (bouton "Envoyer au client") — jamais
 * automatique. La route est protégée par requireAuth (admin ou membre).
 */
import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { sendEmail } from '../lib/email'

const router = Router()
router.use(requireAuth)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type DocKind = 'facture' | 'devis' | 'recu'

const LABELS: Record<DocKind, { title: string; label: string; icon: string }> = {
  facture: { title: 'Votre facture',    label: 'facture',    icon: '📄' },
  devis:   { title: 'Votre devis',      label: 'devis',      icon: '📋' },
  recu:    { title: 'Votre reçu',       label: 'reçu',       icon: '🧾' },
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtml(kind: DocKind, numero: string, clientNom: string | null, personal: string | null): string {
  const { title, label, icon } = LABELS[kind]
  const greeting = clientNom ? `Bonjour ${escapeHtml(clientNom)},` : 'Bonjour,'
  const intro    = `Vous trouverez en pièce jointe votre ${label} <strong>${escapeHtml(numero)}</strong>.`
  const personalBlock = personal
    ? `<p style="padding:12px;background:#f1f5f9;border-radius:8px;border-left:3px solid #2563eb;white-space:pre-wrap;">${escapeHtml(personal)}</p>`
    : ''
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Inter,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,0.06);overflow:hidden;">
        <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#eff6ff,#fff);border-bottom:1px solid #e2e8f0;">
          <h1 style="margin:0;font-size:18px;color:#0f172a;">${icon}&nbsp; ${title}</h1>
        </td></tr>
        <tr><td style="padding:24px 32px;font-size:14px;color:#334155;line-height:1.6;">
          <p style="margin:0 0 12px;">${greeting}</p>
          <p style="margin:0 0 16px;">${intro}</p>
          ${personalBlock}
          <p style="margin:16px 0 0;font-size:13px;color:#64748b;">Pour toute question, n'hésitez pas à répondre à ce message.</p>
        </td></tr>
        <tr><td style="padding:14px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">Envoyé depuis NEXT GITAL · CRM &amp; Gestion</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/**
 * Body attendu :
 *   {
 *     to:         string           – email destinataire (obligatoire)
 *     kind:       'facture' | 'devis' | 'recu'
 *     numero:     string           – identifiant du document (ex: "F-2026-001")
 *     clientNom?: string           – utilisé dans "Bonjour X,"
 *     message?:   string           – message perso ajouté par l'admin
 *     filename:   string           – nom du fichier PDF (ex: "F-2026-001.pdf")
 *     pdfBase64:  string           – contenu du PDF encodé base64 (sans "data:")
 *   }
 */
router.post('/', async (req: Request, res: Response) => {
  const { to, kind, numero, clientNom, message, filename, pdfBase64 } = req.body ?? {}

  if (!to || typeof to !== 'string' || !EMAIL_RE.test(to)) {
    return res.status(400).json({ error: 'Email destinataire invalide' })
  }
  if (kind !== 'facture' && kind !== 'devis' && kind !== 'recu') {
    return res.status(400).json({ error: 'Type de document invalide' })
  }
  if (!numero || typeof numero !== 'string') {
    return res.status(400).json({ error: 'Numéro du document manquant' })
  }
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Nom du fichier manquant' })
  }
  if (!pdfBase64 || typeof pdfBase64 !== 'string' || pdfBase64.length < 100) {
    return res.status(400).json({ error: 'Contenu PDF manquant ou invalide' })
  }
  /* Garde-fou : refuse un payload > ~8 Mo (base64 ~1.33× la taille binaire). */
  if (pdfBase64.length > 8 * 1024 * 1024 * 4 / 3) {
    return res.status(413).json({ error: 'Le PDF dépasse la taille maximale' })
  }

  const { title } = LABELS[kind as DocKind]
  const subject   = `${title} — ${numero}`
  const html      = buildHtml(kind as DocKind, numero, typeof clientNom === 'string' ? clientNom : null, typeof message === 'string' ? message : null)

  try {
    await sendEmail({
      to,
      subject,
      html,
      text: `${title} : ${numero}. Le document est joint à cet email.`,
      attachments: [{ filename, content: pdfBase64 }],
    })
    console.log(`[send-document] ${kind} ${numero} envoyé à ${to} par tenant=${req.user!.tenantId}`)
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[send-document] error:', err?.message)
    res.status(502).json({ error: `Envoi échoué : ${err?.message ?? 'erreur inconnue'}` })
  }
})

export default router
