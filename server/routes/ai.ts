/**
 * Module IA — routes de correction, reformulation, génération et auto-complétion.
 *
 * Fournisseur : OpenAI (via API HTTP directe — pas de SDK, pas de dépendance).
 * Modèle par défaut : gpt-4o-mini (rapide + très bon marché).
 *
 * Endpoints :
 *   POST /api/ai/correct    — corrige typo, grammaire, ponctuation
 *   POST /api/ai/rewrite    — reformule dans un style choisi
 *   POST /api/ai/generate   — génère un contenu à partir d'un sujet
 *   POST /api/ai/complete   — auto-complète un mot partiel (ex: "clin" → "client")
 *
 * Sécurité : requireAuth partout. Rate limiter global. Clé API côté serveur
 * uniquement — jamais exposée au client.
 */
import { Router, Request, Response } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { requireAuth } from '../middleware/auth'

const router = Router()

/* Limite : 60 requêtes / minute / utilisateur — protège contre l'abus
   et contre les boucles infinies front-end.
   IPv6-safe : utilise ipKeyGenerator de la lib pour normaliser les /64,
   sinon les IPv6 pouvaient bypasser la limite (chaque adresse est unique
   dans un /64 énorme). Préfixe uid: quand l'utilisateur est connu pour
   éviter le partage entre users derrière une même IP (bureau, VPN). */
const limiter = rateLimit({
  windowMs: 60_000,
  max:      60,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req: Request) =>
    req.user?.userId
      ? `u:${req.user.userId}`
      : `ip:${ipKeyGenerator(req.ip ?? '')}`,
  message: { error: 'Trop de requêtes IA — réessaie dans une minute.' },
})

router.use(requireAuth)
router.use(limiter)

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

function hasKey(): boolean {
  return !!process.env.OPENAI_API_KEY
}

/**
 * Appel générique à l'API OpenAI Chat Completions.
 * Retourne la première réponse texte, ou lève une erreur.
 */
async function callOpenAI(
  system: string,
  user:   string,
  opts:   { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const { maxTokens = 800, temperature = 0.3 } = opts
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model:       MODEL,
      temperature,
      max_tokens:  maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`)
  }
  const json: any = await res.json()
  const content = json?.choices?.[0]?.message?.content ?? ''
  return String(content).trim()
}

/* ═══════════════════════════════════════════════════════════════════
   POST /api/ai/correct
═══════════════════════════════════════════════════════════════════ */
router.post('/correct', async (req: Request, res: Response) => {
  const text = String(req.body?.text ?? '').trim()
  if (!text)         return res.status(400).json({ error: 'Texte requis' })
  if (text.length > 3000) return res.status(400).json({ error: 'Texte trop long (max 3000 caractères)' })
  if (!hasKey())     return res.status(503).json({ error: 'Module IA non configuré (OPENAI_API_KEY manquant)' })

  try {
    const system = [
      'Tu es un correcteur professionnel français.',
      'Corrige uniquement les fautes d\'orthographe, de grammaire, de conjugaison, de ponctuation et de typographie.',
      'Complète intelligemment les mots incomplets ou tronqués (ex : "clin" → "client" si le contexte le suggère).',
      'Applique la typographie française : « … », espace insécable avant : ; ! ?, apostrophe typographique ’.',
      'Garde le sens et le ton d\'origine. Ne reformule pas.',
      'Réponds UNIQUEMENT par le texte corrigé, sans introduction ni commentaire.',
    ].join(' ')
    const corrected = await callOpenAI(system, text, { temperature: 0.1, maxTokens: 1200 })
    res.json({ text: corrected })
  } catch (e: any) {
    console.error('[ai:correct]', e?.message ?? e)
    res.status(502).json({ error: 'Erreur du service IA' })
  }
})

/* ═══════════════════════════════════════════════════════════════════
   POST /api/ai/rewrite
═══════════════════════════════════════════════════════════════════ */
const ALLOWED_STYLES = new Set([
  'professionnel', 'commercial', 'poli', 'technique', 'court', 'detaille',
])

router.post('/rewrite', async (req: Request, res: Response) => {
  const text  = String(req.body?.text  ?? '').trim()
  const style = String(req.body?.style ?? '').trim()
  if (!text)                    return res.status(400).json({ error: 'Texte requis' })
  if (!ALLOWED_STYLES.has(style)) return res.status(400).json({ error: 'Style invalide' })
  if (!hasKey())                return res.status(503).json({ error: 'Module IA non configuré' })

  const STYLE_INSTRUCTIONS: Record<string, string> = {
    professionnel: 'un registre soutenu et professionnel, vocabulaire précis',
    commercial:    'un ton commercial engageant, avec accroche et appel à l\'action',
    poli:          'un ton très poli et respectueux, en vouvoyant, avec formule de politesse',
    technique:     'un ton technique structuré, avec points clés en liste si pertinent',
    court:         'un texte concis, sans mots inutiles, aussi court que possible',
    detaille:      'un texte étoffé avec transitions et explications',
  }

  try {
    const system = [
      `Tu reformules ce texte français en gardant le sens, dans ${STYLE_INSTRUCTIONS[style]}.`,
      'Corrige aussi les fautes.',
      'Réponds UNIQUEMENT par le texte reformulé, sans introduction.',
    ].join(' ')
    const out = await callOpenAI(system, text, { temperature: 0.5, maxTokens: 1200 })
    res.json({ text: out })
  } catch (e: any) {
    console.error('[ai:rewrite]', e?.message ?? e)
    res.status(502).json({ error: 'Erreur du service IA' })
  }
})

/* ═══════════════════════════════════════════════════════════════════
   POST /api/ai/generate
═══════════════════════════════════════════════════════════════════ */
const ALLOWED_KINDS = new Set([
  'tache', 'produit', 'devis', 'facture', 'projet', 'rapport', 'email',
])
const KIND_INSTRUCTIONS: Record<string, string> = {
  tache:   'une description de tâche professionnelle (objectif, étapes clés, livrable attendu)',
  produit: 'une description commerciale de produit (accroche, caractéristiques, avantages)',
  devis:   'une ligne de devis claire (prestation, contenu, valeur ajoutée)',
  facture: 'une ligne de facture claire (prestation réalisée, référence au devis si pertinent)',
  projet:  'une description de projet (contexte, objectifs, livrables)',
  rapport: 'la structure d\'un rapport (contexte, analyse, résultats, recommandations, conclusion)',
  email:   'un email professionnel (salutation, corps clair, formule de politesse)',
}

router.post('/generate', async (req: Request, res: Response) => {
  const subject = String(req.body?.subject ?? '').trim()
  const kind    = String(req.body?.kind    ?? '').trim()
  if (!subject)                return res.status(400).json({ error: 'Sujet requis' })
  if (!ALLOWED_KINDS.has(kind)) return res.status(400).json({ error: 'Type invalide' })
  if (!hasKey())               return res.status(503).json({ error: 'Module IA non configuré' })

  try {
    const system = [
      `Génère ${KIND_INSTRUCTIONS[kind]} en français, à partir du sujet fourni.`,
      'Sois concret et professionnel.',
      'Réponds UNIQUEMENT par le texte généré, sans introduction.',
    ].join(' ')
    const out = await callOpenAI(system, subject, { temperature: 0.6, maxTokens: 1000 })
    res.json({ text: out })
  } catch (e: any) {
    console.error('[ai:generate]', e?.message ?? e)
    res.status(502).json({ error: 'Erreur du service IA' })
  }
})

/* ═══════════════════════════════════════════════════════════════════
   POST /api/ai/complete
   Auto-complétion d'un mot partiel. Le client envoie :
     { partial: "clin", context: "Nom du client :" }
   Retourne : { suggestions: ["client", "clinique"] }
═══════════════════════════════════════════════════════════════════ */
router.post('/complete', async (req: Request, res: Response) => {
  const partial = String(req.body?.partial ?? '').trim()
  const context = String(req.body?.context ?? '').trim().slice(0, 300)
  if (!partial || partial.length < 2)  return res.json({ suggestions: [] })
  if (!hasKey())                        return res.status(503).json({ error: 'Module IA non configuré' })

  try {
    const system = [
      'Tu es un moteur d\'auto-complétion français.',
      'Reçois un mot partiel (et éventuellement un contexte) et propose 1 à 3 complétions plausibles.',
      'Réponds STRICTEMENT au format JSON : {"s":["mot1","mot2"]} — pas de texte hors JSON.',
      'Les complétions doivent commencer par le mot partiel exact (respect de la casse initiale).',
      'Priorise le mot le plus probable en premier.',
    ].join(' ')
    const user = context
      ? `Contexte : ${context}\nMot partiel : ${partial}`
      : `Mot partiel : ${partial}`
    const raw = await callOpenAI(system, user, { temperature: 0.2, maxTokens: 80 })
    // Extraire le JSON même si le modèle a mis du texte autour
    const m = raw.match(/\{[\s\S]*\}/)
    const parsed = m ? JSON.parse(m[0]) : { s: [] }
    const suggestions = Array.isArray(parsed?.s)
      ? parsed.s.filter((x: any) => typeof x === 'string').slice(0, 3)
      : []
    res.json({ suggestions })
  } catch (e: any) {
    console.error('[ai:complete]', e?.message ?? e)
    res.json({ suggestions: [] })  // silencieux — ne pas casser la frappe
  }
})

/* ═══════════════════════════════════════════════════════════════════
   POST /api/ai/translate
   Traduit vers le français (depuis n'importe quelle langue : arabe,
   anglais, darija, etc.) en corrigeant les fautes de frappe. Idéal
   pour un utilisateur qui écrit vite dans sa langue et veut un texte
   professionnel en français.
═══════════════════════════════════════════════════════════════════ */
router.post('/translate', async (req: Request, res: Response) => {
  const text = String(req.body?.text ?? '').trim()
  if (!text)              return res.status(400).json({ error: 'Texte requis' })
  if (text.length > 3000) return res.status(400).json({ error: 'Texte trop long (max 3000 caractères)' })
  if (!hasKey())          return res.status(503).json({ error: 'Module IA non configuré (OPENAI_API_KEY manquant)' })

  try {
    const system = [
      'Tu traduis en français correct et professionnel.',
      'La source peut être en arabe, darija (arabe marocain), anglais, français avec fautes, ou un mélange.',
      'Corrige d\'abord les fautes de frappe évidentes, devine le sens voulu, puis produis un français impeccable.',
      'Applique la typographie française : apostrophe ’, espace insécable avant : ; ! ?, guillemets « … ».',
      'Garde le sens, le ton et le registre d\'origine (concis reste concis, poli reste poli).',
      'Si le texte est déjà en français correct, corrige uniquement les fautes sans le reformuler.',
      'Réponds UNIQUEMENT par la traduction, sans introduction, sans commentaire, sans guillemets autour.',
    ].join(' ')
    const translated = await callOpenAI(system, text, { temperature: 0.2, maxTokens: 1200 })
    res.json({ text: translated })
  } catch (e: any) {
    console.error('[ai:translate]', e?.message ?? e)
    res.status(502).json({ error: 'Erreur du service IA' })
  }
})

/* ═══════════════════════════════════════════════════════════════════
   GET /api/ai/status — health check pour le front
═══════════════════════════════════════════════════════════════════ */
router.get('/status', (_req: Request, res: Response) => {
  res.json({ configured: hasKey(), model: hasKey() ? MODEL : null })
})

export default router
