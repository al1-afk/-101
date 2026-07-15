/**
 * Génération d'email (et message WhatsApp) personnalisé.
 *
 * Priorité providers :
 *   1. Claude Sonnet 4.6 (Anthropic) — meilleure qualité, prompt caching
 *   2. OpenAI GPT-4o-mini — 10× moins cher, qualité suffisante
 *
 * On utilise automatiquement celui qui est configuré. Si les deux sont
 * présents, Claude gagne (qualité > coût pour le premier contact).
 *
 * Requires env : ANTHROPIC_API_KEY ou OPENAI_API_KEY
 */
import Anthropic from '@anthropic-ai/sdk'

/* ─── Providers ──────────────────────────────────────────────── */

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic | null {
  if (_anthropic) return _anthropic
  if (!process.env.ANTHROPIC_API_KEY) return null
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

function hasOpenAi(): boolean {
  return !!process.env.OPENAI_API_KEY
}

export function isConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)
}

export function activeProvider(): 'claude' | 'openai' | null {
  if (process.env.ANTHROPIC_API_KEY) return 'claude'
  if (process.env.OPENAI_API_KEY)    return 'openai'
  return null
}

/* ─── Types publics ──────────────────────────────────────────── */

export type Channel = 'email' | 'whatsapp'
export type Language = 'fr' | 'ar' | 'en'
export type Tone = 'professionnel' | 'chaleureux' | 'direct'

export interface GenerationContext {
  channel:       Channel
  language:      Language
  tone:          Tone
  sender: {
    company_name: string
    pitch:        string
    contact_name: string
  }
  prospect: {
    company:     string
    contact:     string | null
    sector:      string | null
    city:        string | null
    website:     string | null
    notes:       string | null
  }
  /** Service précis à mettre en avant (ex: "ERP", "Site web", "Marketing IA"). */
  service_focus?: string | null
  template_body?: string | null
}

export interface EmailDraft { subject: string; body: string }

/* ─── Prompts ────────────────────────────────────────────────── */

const EMAIL_SYSTEM_PROMPT = `Tu es un rédacteur expert en prospection B2B pour des entreprises marocaines et francophones.
Ta mission : écrire un email court, personnalisé, non-générique, qui donne envie de répondre.

RÈGLES STRICTES :
- Longueur : 60-100 mots MAX pour le corps
- Objet : max 50 caractères, sans emoji, sans "!" ni majuscules abusives
- TOUJOURS mentionner UN élément concret spécifique au prospect (secteur, ville, activité)
- TOUJOURS proposer UNE SEULE offre/service concret extrait du PITCH ÉMETTEUR (ne pas parler d'"expertise" ou "solutions" en général — être PRÉCIS : "un site vitrine", "un CRM", "une automatisation marketing IA", "un module de gestion", etc.)
- Adapter le service proposé au secteur du prospect (ex: pour un restaurant → site web + réservation en ligne ; pour une clinique → CRM patients + rappels WhatsApp)
- Terminer par UNE question ouverte (pas un CTA générique)
- Ton doit correspondre à la consigne donnée
- INTERDIT : "J'espère que ce message vous trouve bien", "je me permets", "n'hésitez pas à revenir vers moi"
- INTERDIT : "votre expertise", "vos solutions", "votre savoir-faire" — VAGUE = REJETÉ
- INTERDIT : mentions de "10% de réduction", "offre limitée", tout ce qui ressemble à du spam
- Si la langue est arabe : rédiger en arabe standard clair, pas de dialecte

Tu réponds STRICTEMENT en JSON, sans markdown, sans texte hors JSON :
{"subject": "...", "body": "..."}`

const WHATSAPP_SYSTEM_PROMPT = `Tu es un rédacteur expert en prospection WhatsApp B2B francophone/arabophone.
Ta mission : écrire un message WhatsApp court (2-3 phrases MAX, 200 caractères total max), personnalisé, non-générique.

RÈGLES STRICTES :
- Ton conversationnel, pas commercial-lourd
- TOUJOURS te présenter avec ton prénom + entreprise en une phrase
- Mentionner UN élément spécifique au prospect
- Terminer par une question courte
- INTERDIT : les emojis, les liens, les "OFFRE SPÉCIALE"
- Si arabe : arabe standard, pas de dialecte

Tu réponds STRICTEMENT en JSON, sans markdown :
{"body": "..."}`

function buildUserPrompt(ctx: GenerationContext): string {
  const parts = [
    `Langue: ${ctx.language}`,
    `Ton: ${ctx.tone}`,
    '',
    'ENTREPRISE ÉMETTRICE :',
    `- Nom: ${ctx.sender.company_name}`,
    `- Pitch: ${ctx.sender.pitch}`,
    `- Signataire: ${ctx.sender.contact_name}`,
    '',
    'PROSPECT :',
    `- Entreprise: ${ctx.prospect.company}`,
    `- Contact: ${ctx.prospect.contact ?? 'inconnu'}`,
    `- Secteur: ${ctx.prospect.sector ?? 'inconnu'}`,
    `- Ville: ${ctx.prospect.city ?? 'inconnue'}`,
    `- Site: ${ctx.prospect.website ?? 'inconnu'}`,
    `- Notes internes: ${ctx.prospect.notes ?? 'aucune'}`,
  ]
  if (ctx.service_focus) {
    parts.push('',
      `⚡ SERVICE À METTRE EN AVANT (obligatoire) : "${ctx.service_focus}"`,
      `→ Le corps de l'email DOIT proposer explicitement ce service, adapté au secteur/activité du prospect.`,
      `→ Ne parle PAS des autres offres du pitch — reste focalisé sur "${ctx.service_focus}".`)
  }
  if (ctx.template_body) {
    parts.push('', 'MODÈLE D\'INSPIRATION (à personnaliser, NE PAS copier tel quel) :', ctx.template_body)
  }
  parts.push('', 'Génère maintenant.')
  return parts.join('\n')
}

/* ─── API publique ───────────────────────────────────────────── */

export async function generateEmail(ctx: GenerationContext): Promise<EmailDraft> {
  if (ctx.channel !== 'email') throw new Error('Channel doit être "email"')
  const provider = activeProvider()
  if (!provider) throw new Error('Aucun provider IA configuré (ANTHROPIC_API_KEY ou OPENAI_API_KEY)')

  const raw = provider === 'claude'
    ? await callClaude(EMAIL_SYSTEM_PROMPT, buildUserPrompt(ctx), 600)
    : await callOpenAI(EMAIL_SYSTEM_PROMPT, buildUserPrompt(ctx), 600)

  const parsed = safeParseJson(raw)
  if (!parsed?.subject || !parsed?.body) {
    throw new Error('Réponse IA invalide (subject/body manquants)')
  }
  return { subject: String(parsed.subject).trim(), body: String(parsed.body).trim() }
}

export async function generateWhatsApp(ctx: GenerationContext): Promise<string> {
  if (ctx.channel !== 'whatsapp') throw new Error('Channel doit être "whatsapp"')
  const provider = activeProvider()
  if (!provider) throw new Error('Aucun provider IA configuré')

  const raw = provider === 'claude'
    ? await callClaude(WHATSAPP_SYSTEM_PROMPT, buildUserPrompt(ctx), 300)
    : await callOpenAI(WHATSAPP_SYSTEM_PROMPT, buildUserPrompt(ctx), 300)

  const parsed = safeParseJson(raw)
  if (!parsed?.body) throw new Error('Réponse IA invalide (body manquant)')
  return String(parsed.body).trim()
}

/* ─── Providers concrets ─────────────────────────────────────── */

async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const client = getAnthropic()
  if (!client) throw new Error('ANTHROPIC_API_KEY manquant')
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const block = resp.content.find(b => b.type === 'text')
  return block && block.type === 'text' ? block.text.trim() : ''
}

/* GPT-4o-mini tuning :
   - temperature 0.75  → créativité contrôlée, chaque email varie sans devenir bizarre
   - top_p 0.9         → coupe la traîne des tokens improbables (moins de dérapages)
   - frequency_penalty 0.4  → évite les répétitions ("nous nous… nous nous…")
   - presence_penalty 0.2   → encourage la variété lexicale
   - response_format JSON mode → garantit un objet parseable */
async function callOpenAI(system: string, user: string, maxTokens: number): Promise<string> {
  if (!hasOpenAi()) throw new Error('OPENAI_API_KEY manquant')
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.75,
      top_p: 0.9,
      frequency_penalty: 0.4,
      presence_penalty: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    /* Messages parlants pour les erreurs les plus courantes GPT. */
    if (res.status === 401) throw new Error('OpenAI 401 — OPENAI_API_KEY invalide ou révoquée')
    if (res.status === 429) throw new Error('OpenAI 429 — quota dépassé ou pas de billing configuré')
    if (res.status === 400 && detail.includes('response_format')) {
      throw new Error(`OpenAI: le modèle "${model}" ne supporte pas JSON mode. Utilise gpt-4o-mini.`)
    }
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`)
  }
  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'length') {
    /* Le modèle a été coupé — le JSON est probablement invalide. */
    throw new Error(`OpenAI: réponse tronquée (max_tokens=${maxTokens} atteint). Réessaye.`)
  }
  return choice?.message?.content?.trim() ?? ''
}

/* ─── Helpers ────────────────────────────────────────────────── */

function safeParseJson(raw: string): any {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try { return JSON.parse(cleaned) } catch { return null }
}
