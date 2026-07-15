/**
 * WhatsApp — envoi de messages template (marketing).
 *
 * Supporte 2 providers, sélection automatique via .env.local :
 *
 *   🅰️ Gupshup Partner API (recommandé si tu as un compte BSP Gupshup)
 *      Docs : https://docs.gupshup.io/reference/msg
 *      Requires env :
 *        WHATSAPP_PROVIDER=gupshup
 *        GUPSHUP_API_KEY            (Settings → App → API Key)
 *        GUPSHUP_APP_NAME           (nom de l'app Gupshup, PAS le nom Business)
 *        GUPSHUP_SOURCE_NUMBER      (numéro E.164 sans "+" — ex "212612345678")
 *
 *   🅱️ Meta WhatsApp Cloud API (accès direct sans BSP)
 *      Docs : https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 *      Requires env :
 *        WHATSAPP_PROVIDER=meta  (ou absent, meta est le default)
 *        WHATSAPP_CLOUD_TOKEN
 *        WHATSAPP_PHONE_NUMBER_ID
 *
 * Dans les 2 cas, le template DOIT être pré-approuvé côté Meta Business Manager
 * (catégorie MARKETING, en français/arabe/anglais).
 */

type Provider = 'gupshup' | 'meta'

function selectedProvider(): Provider {
  const p = (process.env.WHATSAPP_PROVIDER ?? '').toLowerCase()
  if (p === 'gupshup') return 'gupshup'
  return 'meta'
}

export function isConfigured(): boolean {
  const p = selectedProvider()
  if (p === 'gupshup') {
    return !!(process.env.GUPSHUP_API_KEY && process.env.GUPSHUP_APP_NAME && process.env.GUPSHUP_SOURCE_NUMBER)
  }
  return !!(process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
}

export function activeWhatsAppProvider(): Provider | null {
  return isConfigured() ? selectedProvider() : null
}

export interface SendTemplateOpts {
  /** Numéro E.164 sans "+" (ex. "212612345678") */
  to:            string
  /** Nom exact du template pré-approuvé côté Meta */
  templateName:  string
  /** Doit correspondre à la langue du template */
  languageCode:  'ar' | 'fr' | 'en'
  /** Variables du body du template, dans l'ordre {{1}}, {{2}}, ... */
  variables:     string[]
}

export interface SendTemplateResult {
  wamid:      string
  contact_wa: string
  provider:   Provider
}

export async function sendWhatsAppTemplate(opts: SendTemplateOpts): Promise<SendTemplateResult> {
  const to = opts.to.replace(/\D/g, '')
  if (!to || to.length < 10) throw new Error('Numéro destinataire invalide')

  const provider = selectedProvider()
  if (provider === 'gupshup') return sendViaGupshup(to, opts)
  return sendViaMeta(to, opts)
}

/* ─── Gupshup Partner API ────────────────────────────────────── */

async function sendViaGupshup(to: string, opts: SendTemplateOpts): Promise<SendTemplateResult> {
  const apiKey  = process.env.GUPSHUP_API_KEY
  const appName = process.env.GUPSHUP_APP_NAME
  const source  = process.env.GUPSHUP_SOURCE_NUMBER
  if (!apiKey || !appName || !source) {
    throw new Error('GUPSHUP_API_KEY / GUPSHUP_APP_NAME / GUPSHUP_SOURCE_NUMBER manquants')
  }

  /* Gupshup /wa/api/v1/template/msg — form-urlencoded (ATTENTION : PAS de JSON).
     Docs : https://docs.gupshup.io/reference/msg */
  const url = 'https://api.gupshup.io/wa/api/v1/template/msg'
  const params = new URLSearchParams({
    source,
    destination: to,
    'src.name':  appName,
    template: JSON.stringify({
      id: opts.templateName,             /* le "template name" côté Meta = "id" ici */
      params: opts.variables,
    }),
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey':       apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gupshup ${res.status}: ${detail.slice(0, 400)}`)
  }
  const data = await res.json() as { messageId?: string; status?: string }
  if (!data.messageId) throw new Error(`Gupshup: réponse invalide (${data.status ?? 'sans status'})`)
  return { wamid: data.messageId, contact_wa: to, provider: 'gupshup' }
}

/* ─── Meta Cloud API ─────────────────────────────────────────── */

async function sendViaMeta(to: string, opts: SendTemplateOpts): Promise<SendTemplateResult> {
  const token   = process.env.WHATSAPP_CLOUD_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) throw new Error('WHATSAPP_CLOUD_TOKEN / WHATSAPP_PHONE_NUMBER_ID manquants')

  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name:     opts.templateName,
      language: { code: opts.languageCode },
      components: opts.variables.length
        ? [{
            type: 'body',
            parameters: opts.variables.map(v => ({ type: 'text', text: v })),
          }]
        : [],
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Meta Cloud ${res.status}: ${detail.slice(0, 400)}`)
  }
  const data = await res.json() as {
    messages?: Array<{ id: string; message_status?: string }>
    contacts?: Array<{ wa_id: string; input: string }>
  }
  const wamid = data.messages?.[0]?.id
  const contact_wa = data.contacts?.[0]?.wa_id ?? to
  if (!wamid) throw new Error('Réponse Meta invalide (wamid manquant)')
  return { wamid, contact_wa, provider: 'meta' }
}
