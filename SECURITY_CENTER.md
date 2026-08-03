# Centre de sécurité — note d'exploitation

Module de **monitoring** : Administration → Centre de sécurité
(`/:tenantSlug/centre-securite`).

Il observe, il ne protège pas à la place des autres couches. Le contrôle
d'accès, l'isolation par tenant (RLS), le rate limiting, la validation et
la sécurisation JWT restent entièrement en place et inchangés.

---

## 1. Qui y a accès

| Rôle | Accès |
|------|-------|
| `admin` | ✅ |
| `manager`, `commercial`, `comptable`, `viewer` | ❌ |
| N'importe quel rôle porteur de `SECURITY_MONITORING_READ` | ✅ |

Le droit est vérifié **côté serveur, en base, à chaque appel**
(`requireSecurityMonitoring`) — pas d'après le rôle inscrit dans le JWT.
Conséquence voulue : un administrateur rétrogradé ou désactivé perd
l'accès immédiatement, sans attendre l'expiration de son token (1 h).
Masquer l'entrée de menu côté React n'est qu'un confort d'affichage.

Accorder la permission à un non-admin :

```sql
INSERT INTO user_permissions (tenant_id, user_id, permission, granted_by)
VALUES ('<tenant_id>', '<user_id>', 'SECURITY_MONITORING_READ', '<admin_user_id>');
```

La révoquer :

```sql
UPDATE user_permissions SET revoked_at = NOW()
 WHERE user_id = '<user_id>' AND permission = 'SECURITY_MONITORING_READ';
```

---

## 2. Ce qui est journalisé — et ce qui ne l'est jamais

**Journalisé** : date, utilisateur (si identifié), email tenté, IP,
User-Agent tronqué, type d'événement, sévérité, statut, endpoint
normalisé, code HTTP, raison normalisée, request-id, métadonnées filtrées.

**Jamais journalisé** : mot de passe, access token, refresh token, JWT,
en-tête `Authorization`, cookie, secret, clé d'API, code 2FA. Les
métadonnées passent par `sanitizeMetadata()` (mêmes règles de redaction
que les logs applicatifs) et la query string des URL est supprimée avant
écriture — un `?token=…` ne peut donc pas fuiter dans le journal.

Un test d'intégration vérifie qu'aucun secret ne se retrouve en base, et
que la table n'expose aucune colonne de type secret.

## 3. Sévérités et statuts

Sévérités : `info` · `low` · `medium` · `high` · `critical`
Statuts : `normal` · `suspicious` · `blocked` · `confirmed`

Règle appliquée : **une simple erreur n'est jamais qualifiée de tentative
d'intrusion**. Un 401 isolé, un 403 isolé, un échec de connexion isolé
restent `low`/`normal`. C'est l'accumulation — via les alertes — qui fait
monter le niveau.

`confirmed` est réservé aux preuves techniques déterministes, aujourd'hui
deux cas seulement :

- `token_reuse_detected` — rejeu d'un refresh token déjà révoqué (la
  rotation est atomique côté serveur : impossible par accident) ;
- `path_traversal_blocked` — `../` décodé dans un chemin de fichier.

## 4. Alertes

Déduplication par `alert_key` (tenant + type + IP + user + email) : une
seule alerte **ouverte** par motif, avec un compteur d'occurrences. Le
cooldown (5 min en `critical`, 15 min en `high`, 1 h en `medium`, 3 h
sinon) empêche le flood de notifications.

Seuils de détection (`server/lib/securityCore.ts` → `THRESHOLDS`) :

| Signal | Seuil | Fenêtre |
|--------|-------|---------|
| Échecs de connexion par IP | 10 | 15 min |
| Échecs sur un même compte | 8 | 15 min |
| Refus d'accès répétés (403) | 15 | 15 min |
| Déclenchements de rate limit | 5 | 15 min |
| Balayage d'identifiants (404 en série) | 20 | 10 min |

`channel_state` (`pending`/`sent`/`skipped`) prépare l'envoi email ou la
notification interne : la structure est là, l'expéditeur reste à brancher.

## 5. Rétention

Purge quotidienne automatique (`purge_security_center()`, lancée par le
scheduler Node 5 min après le démarrage puis toutes les 24 h) :

| Données | Conservation |
|---------|--------------|
| Événements `info` / `low` | 30 jours |
| Événements `medium` | 90 jours |
| Événements `high` / `critical` | 180 jours |
| `login_attempts` | 90 jours |
| `login_history` | 180 jours |
| Présence (`user_presence`) | 7 jours |
| Alertes acquittées / résolues | 90 jours |

Purge manuelle : `SELECT * FROM purge_security_center();`

## 6. Adresses IP derrière Traefik / Dokploy

`X-Forwarded-For` est un en-tête que n'importe quel client peut envoyer.
Seule la valeur écrite par le dernier proxy de confiance est retenue
(`req.ip` d'Express, jamais un en-tête brut ; `X-Real-IP`,
`CF-Connecting-IP` et consorts sont ignorés).

`TRUST_PROXY_HOPS` doit refléter le déploiement réel :

| Situation | Valeur |
|-----------|--------|
| Traefik/Dokploy en frontal (production) | `1` — **défaut en prod** |
| CDN (Cloudflare…) devant Traefik | `2` |
| API joignable directement, sans proxy | `0` — **défaut hors prod** |

Sur-déclarer le nombre de hops rouvre l'usurpation d'IP (rate limiting
contournable, journal falsifiable) : la valeur est plafonnée à 3.
Le Centre de sécurité affiche en bas de la vue d'ensemble le nombre de
hops, la profondeur de chaîne observée et l'IP résolue, pour vérifier la
cohérence d'un coup d'œil.

## 7. Présence (« qui est connecté ? »)

Un JWT valide **ne prouve pas** qu'un utilisateur est en ligne : le token
vit 1 h. La présence repose sur un heartbeat envoyé chaque minute par
onglet actif (arrêté quand l'onglet passe en arrière-plan) :

- **en ligne** : dernière activité < 2 min ;
- **inactif** : < 15 min ;
- **hors ligne** : au-delà (ligne ignorée puis purgée).

La déconnexion retire la présence immédiatement. Maximum 20 sessions
conservées par utilisateur.

## 8. Endpoints

| Méthode | Route | Accès |
|---------|-------|-------|
| POST | `/api/security/heartbeat` | tout utilisateur authentifié (n'écrit que sa propre présence) |
| POST | `/api/security/heartbeat/end` | idem |
| GET | `/api/security/overview` | admin / `SECURITY_MONITORING_READ` |
| GET | `/api/security/online` | idem |
| GET | `/api/security/logins` | idem |
| GET | `/api/security/events` | idem |
| GET | `/api/security/ip/:ip` | idem |
| GET | `/api/security/alerts` | idem |
| POST | `/api/security/alerts/:id/acknowledge` | idem |

Toutes les lectures sont paginées (limite plafonnée à 200) et filtrées
par le `tenantId` du JWT — jamais par un paramètre client.

Les lignes sans tenant (`tenant_id IS NULL`) sont visibles par tout
administrateur : ce sont les événements **non attribuables** (échec sur
un email inexistant, rate limit sur IP anonyme). Dès qu'un email
correspond à un compte réel, l'événement est rattaché au tenant de ce
compte et retombe sous le filtre normal.

## 9. Déploiement

1. Appliquer la migration `supabase/migrations/080_security_center.sql`
   (idempotente, purement additive : 4 tables, 2 index sur
   `login_attempts`, 1 fonction de purge).
   En production, les migrations passent par le conteneur :
   `docker exec -i <conteneur-db> psql -U gestiq_api -d gestiq < 080_security_center.sql`
2. Vérifier `TRUST_PROXY_HOPS` (cf. §6).
3. Redémarrer l'API (montage des routes + démarrage du scheduler de purge).

## 10. Tests

```bash
npm run test:security       # 38 tests unitaires — aucune base ni serveur requis
npm run server              # terminal 1
npm run test:security:api   # terminal 2 — 23 tests d'intégration (API + PostgreSQL)
npm run typecheck           # front (tsc -b) + serveur (tsconfig.server.json)
```

Le dernier test d'intégration sature volontairement `authLimiter`
(10 requêtes / 15 min / IP). Relancer la suite dans les 15 minutes
suppose donc de **redémarrer l'API** — le compteur d'express-rate-limit
vit en mémoire.
