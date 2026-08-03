/**
 * Garde-fou SSRF pour les requêtes sortantes vers une URL fournie par
 * un utilisateur.
 *
 * ── Le risque concret ───────────────────────────────────────────────
 * Le module Outbound enrichit les prospects en allant lire leur site web
 * (`googlePlaces.ts` → scraping d'emails sur /contact, /about…). L'URL
 * vient d'un champ saisi ou importé : rien n'empêchait d'y mettre
 * `http://169.254.169.254/latest/meta-data/` (métadonnées cloud, souvent
 * porteuses de jetons d'identité), `http://127.0.0.1:4000/api/...` (l'API
 * elle-même, vue depuis le réseau interne) ou `http://10.0.0.5/`. Le
 * serveur allait chercher la page et en extrayait les adresses email :
 * une exfiltration partielle de contenu interne, sans authentification
 * particulière côté attaquant.
 *
 * ── Ce que ce module impose ─────────────────────────────────────────
 *   - schéma http/https uniquement (pas de file:, gopher:, data:…) ;
 *   - pas d'identifiants dans l'URL (http://user:pass@…) ;
 *   - pas de port exotique (80/443 et ports HTTP courants) ;
 *   - résolution DNS puis REFUS de toute adresse privée, loopback,
 *     link-local, multicast ou réservée — c'est le contrôle central,
 *     car `interne.example.com` peut parfaitement pointer sur 10.0.0.5 ;
 *   - redirections suivies MANUELLEMENT, chaque saut étant revalidé :
 *     sans ça, un site public redirigeant vers 169.254.169.254
 *     contournerait tout le reste.
 *
 * Limite connue et assumée : entre la vérification DNS et la connexion
 * TCP, un attaquant maîtrisant sa zone DNS peut changer la réponse
 * (DNS rebinding). S'en prémunir totalement suppose de piloter la
 * socket (agent personnalisé), ce que `fetch` ne permet pas simplement.
 * Le risque résiduel est documenté plutôt que passé sous silence.
 */
import dns from 'node:dns/promises'
import net from 'node:net'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443'])
const MAX_REDIRECTS = 3

/** Adresse IP non routable publiquement → interdite comme cible. */
export function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip)
  if (v === 4) {
    const p = ip.split('.').map(Number)
    if (p.length !== 4 || p.some(n => Number.isNaN(n))) return true
    const [a, b] = p
    if (a === 0)   return true                     // 0.0.0.0/8
    if (a === 10)  return true                     // privé
    if (a === 127) return true                     // loopback
    if (a === 169 && b === 254) return true        // link-local + métadonnées cloud
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 192 && b === 0)   return true        // IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a >= 224) return true                      // multicast + réservé
    return false
  }
  if (v === 6) {
    const ip6 = ip.toLowerCase()
    if (ip6 === '::' || ip6 === '::1') return true
    if (ip6.startsWith('fe80')) return true        // link-local
    if (ip6.startsWith('fc') || ip6.startsWith('fd')) return true // unique-local
    if (ip6.startsWith('ff')) return true          // multicast
    /* IPv4 mappée : on revalide la partie IPv4 */
    const m = ip6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (m) return isPrivateAddress(m[1])
    return false
  }
  /* Pas une IP → on refuse : l'appelant ne doit jamais deviner. */
  return true
}

export interface UrlCheck { ok: boolean; reason?: string; url?: URL }

/** Valide l'URL sans faire d'appel réseau (schéma, port, identifiants). */
export function checkUrlShape(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'url_invalide' }
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { ok: false, reason: 'protocole_interdit' }
  if (url.username || url.password)         return { ok: false, reason: 'identifiants_dans_url' }
  if (!ALLOWED_PORTS.has(url.port))         return { ok: false, reason: 'port_interdit' }
  if (!url.hostname)                        return { ok: false, reason: 'hote_manquant' }
  return { ok: true, url }
}

/** Valide la cible réelle : résout le nom et refuse toute IP interne. */
export async function checkUrlTarget(raw: string): Promise<UrlCheck> {
  const shape = checkUrlShape(raw)
  if (!shape.ok || !shape.url) return shape
  const host = shape.url.hostname

  /* Hôte déjà littéral : pas de résolution nécessaire. */
  if (net.isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, reason: 'adresse_interne' }
      : { ok: true, url: shape.url }
  }
  try {
    const addrs = await dns.lookup(host, { all: true })
    if (!addrs.length) return { ok: false, reason: 'dns_vide' }
    /* UNE seule adresse interne suffit à refuser : un nom qui résout à
       la fois en public et en interne est précisément le motif d'attaque. */
    if (addrs.some(a => isPrivateAddress(a.address))) {
      return { ok: false, reason: 'resout_vers_adresse_interne' }
    }
    return { ok: true, url: shape.url }
  } catch {
    return { ok: false, reason: 'dns_echec' }
  }
}

export interface SafeFetchResult {
  ok: boolean
  status?: number
  contentType?: string
  body?: string
  reason?: string
}

/**
 * `fetch` restreint aux cibles publiques, redirections revalidées une
 * par une, corps tronqué. Ne lève jamais : renvoie un résultat.
 */
export async function safeFetchText(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number; headers?: Record<string, string> } = {},
): Promise<SafeFetchResult> {
  const { timeoutMs = 5000, maxBytes = 500_000, headers = {} } = opts
  let current = rawUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await checkUrlTarget(current)
    if (!check.ok || !check.url) return { ok: false, reason: check.reason }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(check.url.href, {
        signal: ctrl.signal,
        headers,
        /* Manuel : chaque saut repasse par checkUrlTarget ci-dessus. */
        redirect: 'manual',
      })

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) return { ok: false, reason: 'redirection_sans_cible' }
        current = new URL(loc, check.url).href
        continue
      }
      if (!res.ok) return { ok: false, status: res.status, reason: 'statut_non_ok' }

      const ct = res.headers.get('content-type') ?? ''
      const text = await res.text()
      return {
        ok: true,
        status: res.status,
        contentType: ct,
        body: text.length > maxBytes ? text.slice(0, maxBytes) : text,
      }
    } catch {
      return { ok: false, reason: 'erreur_reseau' }
    } finally {
      clearTimeout(timer)
    }
  }
  return { ok: false, reason: 'trop_de_redirections' }
}
