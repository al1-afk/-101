/**
 * Résolution de l'IP client derrière Traefik / Dokploy.
 *
 * ── Le piège ────────────────────────────────────────────────────────
 * `X-Forwarded-For` est un en-tête que N'IMPORTE QUEL client peut
 * envoyer. Si on lit naïvement le PREMIER élément de la chaîne, un
 * attaquant écrit `X-Forwarded-For: 8.8.8.8` et toutes ses tentatives
 * de brute-force sont attribuées à Google — le rate limiting par IP
 * devient contournable et le Centre de sécurité affiche des données
 * fabriquées.
 *
 * ── Le modèle correct ───────────────────────────────────────────────
 * Traefik AJOUTE l'IP du pair TCP à la fin de la chaîne. La seule
 * valeur digne de confiance est donc celle écrite par le dernier proxy
 * de confiance, c'est-à-dire la N-ième en partant de la DROITE, où N =
 * nombre de proxys que l'on contrôle réellement.
 *
 *   Client (spoof "1.2.3.4") → Traefik → App
 *   X-Forwarded-For: 1.2.3.4, <vraie IP ajoutée par Traefik>
 *                    ^ mensonge          ^ ce qu'on doit retenir
 *
 * C'est exactement la sémantique de `app.set('trust proxy', N)`
 * d'Express : `req.ip` renvoie la première adresse NON approuvée en
 * partant de la droite. On lit donc UNIQUEMENT `req.ip`, jamais un
 * en-tête brut.
 *
 * ── Conséquence opérationnelle ──────────────────────────────────────
 * `TRUST_PROXY_HOPS` doit refléter la réalité du déploiement :
 *   - 1 (défaut) : Traefik/Dokploy en frontal direct ;
 *   - 2          : un CDN (Cloudflare…) devant Traefik ;
 *   - 0          : app exposée sans proxy (aucun XFF n'est cru).
 * Sur-déclarer le nombre de hops rouvre le spoofing : on plafonne donc
 * à 3 et on refuse les valeurs absurdes.
 *
 * En-têtes JAMAIS lus ici, parce que contrôlés par le client et non
 * réécrits par Traefik : X-Real-IP, X-Client-IP, CF-Connecting-IP,
 * True-Client-IP, Forwarded.
 */
import type { Request } from 'express'
import { normalizeIp } from './securityCore'

const MAX_TRUSTED_HOPS = 3

/**
 * Nombre de proxys de confiance, borné et validé.
 *
 * Défaut par environnement — et c'est important :
 *   - production : 1 (Traefik/Dokploy en frontal) ;
 *   - hors production : 0.
 *
 * Pourquoi 0 en développement : en local, l'API est jointe DIRECTEMENT,
 * sans proxy. Déclarer 1 hop reviendrait à croire le premier
 * `X-Forwarded-For` venu — un simple `curl -H 'X-Forwarded-For: 8.8.8.8'`
 * suffirait alors à se faire passer pour n'importe quelle IP dans le
 * journal de sécurité et à contourner le rate limiting par IP. Ce n'est
 * pas théorique : c'est ce qu'un test d'intégration a mis en évidence.
 *
 * Corollaire opérationnel : toute exposition directe de l'API en
 * production (sans passer par Traefik) doit s'accompagner de
 * TRUST_PROXY_HOPS=0, sans quoi la même usurpation redevient possible.
 */
export function trustedProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const fallback = env.NODE_ENV === 'production' ? 1 : 0
  const raw = env.TRUST_PROXY_HOPS
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) return fallback
  return Math.min(n, MAX_TRUSTED_HOPS)
}

/**
 * Cœur de la résolution, isolé d'Express pour être testable.
 *
 * @param forwardedChain  contenu de X-Forwarded-For, gauche → droite
 * @param socketIp        IP du pair TCP (req.socket.remoteAddress)
 * @param hops            nombre de proxys de confiance
 *
 * hops = 0 → on ignore totalement la chaîne (aucun proxy de confiance).
 * hops = N → on saute les N-1 dernières entrées (écrites par nos proxys)
 * et on retient la suivante ; si la chaîne est plus courte que prévu,
 * on retombe sur l'entrée la plus à gauche disponible, puis sur le
 * socket. Une entrée non parsable annule la confiance et fait retomber
 * sur le socket : mieux vaut une IP de proxy qu'une IP inventée.
 */
export function resolveClientIp(
  forwardedChain: string | string[] | undefined,
  socketIp: string | undefined,
  hops: number,
): string | null {
  const socket = normalizeIp(socketIp)
  if (hops <= 0) return socket

  const raw = Array.isArray(forwardedChain) ? forwardedChain.join(',') : forwardedChain
  if (!raw || typeof raw !== 'string') return socket

  const chain = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (!chain.length) return socket

  /* On saute les hops-1 dernières entrées : elles ont été ajoutées par
     nos propres proxys. L'entrée retenue est celle que le dernier proxy
     de confiance a observée comme pair TCP. */
  const index = Math.max(0, chain.length - hops)
  const candidate = normalizeIp(chain[index])
  if (candidate) return candidate

  /* Chaîne malformée à la position attendue → on ne devine pas. */
  return socket
}

/**
 * IP client à journaliser. Utilise `req.ip` (déjà calculé par Express
 * selon `trust proxy`), avec repli sur une résolution explicite si
 * l'application était mal configurée.
 *
 * Renvoie `null` plutôt qu'une valeur de remplissage : une IP inconnue
 * doit rester inconnue dans le journal, pas devenir `0.0.0.0` — sinon le
 * détail par IP agrège des événements sans rapport.
 */
export function getClientIp(req: Request): string | null {
  const fromExpress = normalizeIp(req.ip)
  if (fromExpress) return fromExpress
  return resolveClientIp(
    req.headers['x-forwarded-for'],
    req.socket?.remoteAddress,
    trustedProxyHops(),
  )
}

/**
 * Variante pour les appels legacy qui exigent une chaîne non nulle
 * (colonnes INET NOT NULL des tables historiques login_attempts /
 * refresh_tokens). `0.0.0.0` y signifie explicitement « inconnue ».
 */
export function getClientIpOrUnknown(req: Request): string {
  return getClientIp(req) ?? '0.0.0.0'
}

/** Diagnostic affiché dans le Centre de sécurité (aucune donnée sensible). */
export function proxyDiagnostics(req: Request): {
  hops: number
  resolvedIp: string | null
  forwardedDepth: number
  expressTrustProxy: unknown
} {
  const raw = req.headers['x-forwarded-for']
  const chain = (Array.isArray(raw) ? raw.join(',') : raw ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  return {
    hops:              trustedProxyHops(),
    resolvedIp:        getClientIp(req),
    forwardedDepth:    chain.length,
    expressTrustProxy: req.app?.get('trust proxy'),
  }
}
