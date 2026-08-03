/* ─────────────────────────────────────────────────────────────────
   Centre de sécurité — tests unitaires du noyau.

   Ces tests ne touchent NI la base NI le réseau : ils vérifient les
   décisions qui font la valeur (et le risque) du module :
     - une IP ne peut pas être usurpée via X-Forwarded-For ;
     - aucun secret ne peut atteindre la base ;
     - une simple erreur n'est jamais étiquetée « piratage confirmé » ;
     - la présence expire réellement ;
     - la pagination est bornée ;
     - les alertes ne floodent pas (cooldown).

   Lancer :  npm run test:security
───────────────────────────────────────────────────────────────── */
import test   from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeIp, normalizeEndpoint, normalizeReason, sanitizeUserAgent,
  sanitizeMetadata, containsSecretLike, classifyEvent, isSecurityEventType,
  presenceState, isValidSessionKey, alertKey, cooldownMinutes, shouldNotify,
  clampLimit, clampOffset, periodToHours, severityRank, truncate,
  MAX_PAGE_SIZE, SECURITY_EVENT_TYPES,
} from './securityCore'
import { resolveClientIp, trustedProxyHops } from './clientIp'
import { isPrivateAddress, checkUrlShape, checkUrlTarget } from './safeFetch'

/* ═══════════════════════════════════════════════════════════════
   1. IP derrière le proxy — le point le plus critique du module.
   Une IP usurpable = rate limiting contournable + journal falsifié.
   ═══════════════════════════════════════════════════════════════ */

test('IP : la valeur ajoutée par le proxy de confiance gagne sur celle forgée par le client', () => {
  /* Le client prétend être 8.8.8.8 ; Traefik ajoute sa vraie IP à droite. */
  const chain = '8.8.8.8, 203.0.113.9'
  assert.equal(resolveClientIp(chain, '10.0.0.1', 1), '203.0.113.9')
})

test('IP : une chaîne entièrement forgée ne permet pas de choisir son IP', () => {
  const forged = '1.1.1.1, 2.2.2.2, 3.3.3.3, 198.51.100.7'
  /* Avec 1 hop de confiance, seule la dernière entrée compte. */
  assert.equal(resolveClientIp(forged, '10.0.0.1', 1), '198.51.100.7')
})

test('IP : deux proxys déclarés → on remonte d’un cran supplémentaire', () => {
  /* CDN + Traefik : client, CDN-vu, Traefik-vu */
  const chain = '8.8.8.8, 203.0.113.9, 172.16.0.4'
  assert.equal(resolveClientIp(chain, '10.0.0.1', 2), '203.0.113.9')
})

test('IP : sans proxy de confiance, X-Forwarded-For est totalement ignoré', () => {
  assert.equal(resolveClientIp('8.8.8.8', '198.51.100.7', 0), '198.51.100.7')
})

test('IP : chaîne absente ou vide → IP du socket', () => {
  assert.equal(resolveClientIp(undefined, '198.51.100.7', 1), '198.51.100.7')
  assert.equal(resolveClientIp('', '198.51.100.7', 1), '198.51.100.7')
  assert.equal(resolveClientIp('   ,  ', '198.51.100.7', 1), '198.51.100.7')
})

test('IP : entrée non parsable à la position attendue → repli sur le socket, jamais d’invention', () => {
  assert.equal(resolveClientIp('8.8.8.8, not-an-ip', '198.51.100.7', 1), '198.51.100.7')
})

test('IP : chaîne plus courte que le nombre de hops → repli sûr', () => {
  assert.equal(resolveClientIp('203.0.113.9', '10.0.0.1', 3), '203.0.113.9')
})

test('trustedProxyHops : défaut 1 en production (Traefik), 0 ailleurs', () => {
  const prod = { NODE_ENV: 'production' } as NodeJS.ProcessEnv
  const dev  = { NODE_ENV: 'development' } as NodeJS.ProcessEnv
  assert.equal(trustedProxyHops(prod), 1, 'prod : Traefik est bien devant')
  /* En local l'API est jointe directement : croire X-Forwarded-For
     permettrait à un curl de choisir son IP. */
  assert.equal(trustedProxyHops(dev), 0)
  assert.equal(trustedProxyHops({} as NodeJS.ProcessEnv), 0)
})

test('trustedProxyHops : valeurs absurdes ramenées dans des bornes sûres', () => {
  const prod = { NODE_ENV: 'production' } as NodeJS.ProcessEnv
  assert.equal(trustedProxyHops({ ...prod, TRUST_PROXY_HOPS: '2' }), 2)
  assert.equal(trustedProxyHops({ ...prod, TRUST_PROXY_HOPS: '0' }), 0)
  /* Sur-déclarer les hops rouvrirait le spoofing → plafonné. */
  assert.equal(trustedProxyHops({ ...prod, TRUST_PROXY_HOPS: '99' }), 3)
  assert.equal(trustedProxyHops({ ...prod, TRUST_PROXY_HOPS: '-4' }), 1)
  assert.equal(trustedProxyHops({ ...prod, TRUST_PROXY_HOPS: 'abc' }), 1)
})

test('normalizeIp : IPv4 mappée IPv6, zone-id et port sont normalisés', () => {
  assert.equal(normalizeIp('::ffff:192.168.1.10'), '192.168.1.10')
  assert.equal(normalizeIp('fe80::1%eth0'), 'fe80::1')
  assert.equal(normalizeIp('203.0.113.9:51234'), '203.0.113.9')
  assert.equal(normalizeIp('2001:db8::1'), '2001:db8::1')
})

test('normalizeIp : une valeur non-IP renvoie null (jamais de cast ::inet hasardeux)', () => {
  assert.equal(normalizeIp('unknown'), null)
  assert.equal(normalizeIp('999.1.1.1'), null)
  assert.equal(normalizeIp("1.1.1.1'; DROP TABLE security_events;--"), null)
  assert.equal(normalizeIp(''), null)
  assert.equal(normalizeIp(null), null)
  assert.equal(normalizeIp(42), null)
})

/* ═══════════════════════════════════════════════════════════════
   2. Aucune donnée sensible ne doit être journalisée (§9).
   ═══════════════════════════════════════════════════════════════ */

test('sanitizeMetadata : mot de passe, tokens et header Authorization sont supprimés', () => {
  const dirty = {
    password:      'Sup3rSecret!',
    new_password:  'Autre1234',
    token:         'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop.signature',
    refresh_token: 'a'.repeat(64),
    authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
    cookie:        'gestiq_refresh=abcdef123456',
    api_key:       'sk-live-1234567890',
    code:          '123456',
    table:         'prospects',
  }
  const clean = sanitizeMetadata(dirty) as Record<string, unknown>

  for (const key of ['password', 'new_password', 'token', 'refresh_token',
                     'authorization', 'cookie', 'api_key', 'code']) {
    assert.notEqual(clean[key], dirty[key as keyof typeof dirty],
      `la valeur de ${key} ne doit jamais être conservée telle quelle`)
  }
  /* Les champs métier utiles, eux, doivent survivre. */
  assert.equal(clean.table, 'prospects')

  const serialized = JSON.stringify(clean)
  assert.ok(!serialized.includes('Sup3rSecret!'))
  assert.ok(!serialized.includes('Autre1234'))
  assert.ok(!serialized.includes('sk-live-1234567890'))
})

test('sanitizeMetadata : secrets imbriqués également neutralisés', () => {
  const clean = sanitizeMetadata({ ctx: { nested: { password: 'hunter2' } } })
  assert.ok(!JSON.stringify(clean).includes('hunter2'))
})

test('sanitizeMetadata : payload trop gros remplacé par un marqueur (pas de table qui gonfle)', () => {
  const clean = sanitizeMetadata({ blob: 'x'.repeat(5000) }) as Record<string, unknown>
  assert.equal(clean.truncated, true)
  assert.ok(typeof clean.size === 'number')
})

test('sanitizeMetadata : entrée non-objet → objet vide, jamais de crash', () => {
  assert.deepEqual(sanitizeMetadata(null), {})
  assert.deepEqual(sanitizeMetadata('texte'), {})
  assert.deepEqual(sanitizeMetadata([1, 2, 3]), {})
})

test('containsSecretLike : filet de sécurité indépendant', () => {
  assert.equal(containsSecretLike({ note: 'rien de spécial' }), false)
  assert.equal(containsSecretLike({ h: 'Bearer eyJhbGciOi' }), true)
  assert.equal(containsSecretLike({ deep: { password: 'x' } }), true)
})

test('normalizeEndpoint : la query string est supprimée (un token de reset ne doit jamais fuiter)', () => {
  assert.equal(
    normalizeEndpoint('/api/auth/reset-password?token=abcdef1234567890&email=a@b.c'),
    '/api/auth/reset-password'
  )
})

test('normalizeEndpoint : les identifiants sont agrégés en :id', () => {
  assert.equal(
    normalizeEndpoint('/api/prospects/3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
    '/api/prospects/:id'
  )
  assert.equal(normalizeEndpoint('/api/factures/1234567'), '/api/factures/:id')
})

test('sanitizeUserAgent : bornage et retrait des caractères de contrôle', () => {
  assert.equal(sanitizeUserAgent('Mozilla/5.0 [31m'), 'Mozilla/5.0[31m')
  assert.equal((sanitizeUserAgent('U'.repeat(500)) ?? '').length, 300)
  assert.equal(sanitizeUserAgent(''), null)
  assert.equal(sanitizeUserAgent(undefined), null)
})

test('normalizeReason : snake_case borné', () => {
  assert.equal(normalizeReason('Invalid Password!'), 'invalid_password')
  assert.equal(normalizeReason(''), null)
})

test('truncate : bornage strict', () => {
  assert.equal(truncate('abcdef', 3), 'abc')
  assert.equal(truncate('   ', 10), null)
  assert.equal(truncate(123, 10), null)
})

/* ═══════════════════════════════════════════════════════════════
   3. Classification — ne jamais crier au piratage sans preuve (§3).
   ═══════════════════════════════════════════════════════════════ */

test('classification : un échec de connexion isolé reste LOW/normal', () => {
  const c = classifyEvent('login_failed')
  assert.equal(c.severity, 'low')
  assert.equal(c.status, 'normal')
})

test('classification : un 401 isolé n’est pas une intrusion', () => {
  const c = classifyEvent('unauthorized')
  assert.equal(c.status, 'normal')
  assert.ok(severityRank(c.severity) < severityRank('high'))
})

test('classification : un refus de permission est bloqué mais pas « confirmé »', () => {
  assert.equal(classifyEvent('permission_denied').status, 'blocked')
  assert.notEqual(classifyEvent('permission_denied').status, 'confirmed')
})

test('classification : CONFIRMED réservé aux preuves techniques déterministes', () => {
  const confirmed = SECURITY_EVENT_TYPES.filter(t => classifyEvent(t).status === 'confirmed')
  /* Rejeu d'un refresh token révoqué et traversée de répertoire : deux cas
     qui ne peuvent pas se produire par accident. Toute nouvelle entrée dans
     cette liste doit être un choix explicite. */
    assert.deepEqual([...confirmed].sort(), ['path_traversal_blocked', 'token_reuse_detected'])
})

test('classification : les types graves montent bien en HIGH/CRITICAL', () => {
  assert.equal(classifyEvent('token_reuse_detected').severity, 'critical')
  assert.equal(classifyEvent('tenant_scope_denied').severity, 'high')
  assert.equal(classifyEvent('security_center_access_denied').severity, 'high')
})

test('catalogue fermé : un type inventé est refusé', () => {
  assert.equal(isSecurityEventType('login_failed'), true)
  assert.equal(isSecurityEventType('hack_attempt'), false)
  assert.equal(isSecurityEventType(42), false)
})

/* ═══════════════════════════════════════════════════════════════
   4. Présence — un JWT valide ne suffit pas à être « en ligne ».
   ═══════════════════════════════════════════════════════════════ */

test('présence : en ligne, puis inactif, puis hors ligne', () => {
  const now = new Date('2026-08-02T12:00:00Z')
  const at = (secondsAgo: number) => new Date(now.getTime() - secondsAgo * 1000)

  assert.equal(presenceState(at(0),    now), 'online')
  assert.equal(presenceState(at(119),  now), 'online')
  /* 2 heartbeats manqués → inactif */
  assert.equal(presenceState(at(121),  now), 'idle')
  assert.equal(presenceState(at(890),  now), 'idle')
  /* Au-delà de 15 min → considéré déconnecté, même si le JWT court encore */
  assert.equal(presenceState(at(901),  now), 'offline')
  assert.equal(presenceState(at(3600), now), 'offline')
})

test('présence : date invalide → hors ligne (jamais « en ligne » par défaut)', () => {
  assert.equal(presenceState('pas-une-date'), 'offline')
})

test('présence : la clé de session doit être 32 hex (aucune valeur arbitraire acceptée)', () => {
  assert.equal(isValidSessionKey('a'.repeat(32)), true)
  assert.equal(isValidSessionKey('A1B2C3D4E5F60718293A4B5C6D7E8F90'), true)
  assert.equal(isValidSessionKey('trop-court'), false)
  assert.equal(isValidSessionKey('z'.repeat(32)), false)
  assert.equal(isValidSessionKey("' OR 1=1 --"), false)
  assert.equal(isValidSessionKey(null), false)
})

/* ═══════════════════════════════════════════════════════════════
   5. Alertes — déduplication et cooldown (§6 : pas de flood).
   ═══════════════════════════════════════════════════════════════ */

test('alertes : même motif → même clé de déduplication', () => {
  const a = alertKey({ tenantId: 't1', type: 'brute_force_suspected', ip: '203.0.113.9', userId: null, email: null })
  const b = alertKey({ tenantId: 't1', type: 'brute_force_suspected', ip: '203.0.113.9', userId: null, email: null })
  assert.equal(a, b)
})

test('alertes : motifs différents → clés différentes', () => {
  const base = { tenantId: 't1', type: 'brute_force_suspected', userId: null, email: null }
  assert.notEqual(alertKey({ ...base, ip: '203.0.113.9' }), alertKey({ ...base, ip: '198.51.100.7' }))
  assert.notEqual(alertKey({ ...base, ip: '203.0.113.9' }),
                  alertKey({ ...base, ip: '203.0.113.9', tenantId: 't2' }))
})

test('alertes : email normalisé en minuscules dans la clé (pas de doublon Aa/aa)', () => {
  const k1 = alertKey({ tenantId: 't1', type: 'account_targeted', email: 'Admin@Site.MA' })
  const k2 = alertKey({ tenantId: 't1', type: 'account_targeted', email: 'admin@site.ma' })
  assert.equal(k1, k2)
})

test('alertes : cooldown — pas de re-notification tant qu’il court', () => {
  const now = new Date('2026-08-02T12:00:00Z')
  assert.equal(shouldNotify(null, now), true, 'première occurrence → notifier')
  assert.equal(
    shouldNotify({ cooldown_until: new Date(now.getTime() + 60_000) }, now), false,
    'cooldown en cours → silence'
  )
  assert.equal(
    shouldNotify({ cooldown_until: new Date(now.getTime() - 1_000) }, now), true,
    'cooldown écoulé → on peut re-notifier'
  )
  assert.equal(shouldNotify({ cooldown_until: null }, now), true)
})

test('alertes : plus c’est grave, plus le cooldown est court', () => {
  assert.ok(cooldownMinutes('critical') < cooldownMinutes('high'))
  assert.ok(cooldownMinutes('high')     < cooldownMinutes('medium'))
  assert.ok(cooldownMinutes('medium')   < cooldownMinutes('low'))
})

/* ═══════════════════════════════════════════════════════════════
   6. Pagination et filtres — bornés côté serveur (§10).
   ═══════════════════════════════════════════════════════════════ */

test('pagination : la limite est plafonnée, quoi que demande le client', () => {
  assert.equal(clampLimit(25), 25)
  assert.equal(clampLimit(100_000), MAX_PAGE_SIZE)
  assert.equal(clampLimit(0), 50)
  assert.equal(clampLimit(-5), 50)
  assert.equal(clampLimit('abc'), 50)
  assert.equal(clampLimit(undefined, 20), 20)
})

test('pagination : offset borné (pas d’OFFSET 10^9 qui bloque Postgres)', () => {
  assert.equal(clampOffset(120), 120)
  assert.equal(clampOffset(-3), 0)
  assert.equal(clampOffset('x'), 0)
  assert.equal(clampOffset(9_999_999), 100_000)
})

test('périodes : toute valeur inconnue retombe sur 24 h', () => {
  assert.equal(periodToHours('24h'), 24)
  assert.equal(periodToHours('today'), 24)
  assert.equal(periodToHours('7d'), 168)
  assert.equal(periodToHours('30d'), 720)
  assert.equal(periodToHours('1 OR 1=1'), 24)
  assert.equal(periodToHours(undefined), 24)
})

/* ═══════════════════════════════════════════════════════════════
   7. SSRF — les requêtes sortantes ne doivent jamais viser
   l'intérieur du réseau (métadonnées cloud, API locale, LAN).
   ═══════════════════════════════════════════════════════════════ */

test('SSRF : les adresses internes sont reconnues comme telles', () => {
  const internes = [
    '127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.5.4', '172.31.255.255',
    '192.168.1.1', '169.254.169.254',   // métadonnées cloud AWS/GCP/Azure
    '100.64.0.1',                        // CGNAT
    '::1', 'fe80::1', 'fc00::1', 'fd12::34', '::ffff:127.0.0.1',
  ]
  for (const ip of internes) {
    assert.equal(isPrivateAddress(ip), true, `${ip} doit être refusée`)
  }
})

test('SSRF : les adresses publiques restent autorisées', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']) {
    assert.equal(isPrivateAddress(ip), false, `${ip} doit être autorisée`)
  }
})

test('SSRF : une valeur qui n’est pas une IP est refusée par défaut', () => {
  assert.equal(isPrivateAddress('pas-une-ip'), true)
  assert.equal(isPrivateAddress(''), true)
})

test('SSRF : schémas, ports et identifiants interdits', () => {
  assert.equal(checkUrlShape('file:///etc/passwd').ok, false)
  assert.equal(checkUrlShape('gopher://interne/').ok, false)
  assert.equal(checkUrlShape('http://user:pass@example.com/').ok, false)
  assert.equal(checkUrlShape('http://example.com:22/').ok, false, 'port SSH interdit')
  assert.equal(checkUrlShape('http://example.com:6379/').ok, false, 'port Redis interdit')
  assert.equal(checkUrlShape('n’importe quoi').ok, false)
  /* Cas légitimes */
  assert.equal(checkUrlShape('https://example.com/contact').ok, true)
  assert.equal(checkUrlShape('http://example.com:8080/').ok, true)
})

test('SSRF : une IP interne littérale dans l’URL est refusée', async () => {
  const meta = await checkUrlTarget('http://169.254.169.254/latest/meta-data/')
  assert.equal(meta.ok, false)
  assert.equal(meta.reason, 'adresse_interne')

  const local = await checkUrlTarget('http://127.0.0.1:8080/api/security/events')
  assert.equal(local.ok, false)
  assert.equal(local.reason, 'adresse_interne')
})

test('SSRF : localhost résolu par DNS est également refusé', async () => {
  const r = await checkUrlTarget('http://localhost/')
  assert.equal(r.ok, false, 'localhost doit être bloqué même via résolution DNS')
})
