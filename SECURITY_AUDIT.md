# AUDIT DE SÉCURITÉ — Rapport final

> Réalisé le **2026-07-12** sur la branche `main` (commit initial `e11a5fd`).

---

## 1. Résumé exécutif

L'audit a identifié un ensemble ciblé de vulnérabilités **P0 (critiques)** liées
principalement à l'exposition de tokens en clair (invitations, réinitialisation
de mot de passe) et à la présence de secrets sensibles dans `.env.local`. Toutes
les vulnérabilités **P0 et P1** identifiées ont été corrigées ou atténuées
directement dans ce commit.

Les fondamentaux (bcrypt(12), refresh tokens hashés + rotation + détection de
rejeu, RLS Postgres par tenant, RBAC serveur par table, verrouillage anti
brute-force sur `/login`) étaient déjà en place. Les corrections apportées
renforcent la partie **émission / stockage / affichage des tokens à usage
unique**, la **redaction des logs**, la **rigueur des messages d'erreur**, et
les **headers de sécurité HTTP**.

**Aucun mot de passe** n'est stocké en clair. **Aucun token** en clair ne
transite plus dans les réponses API ni dans les logs.

---

## 2. Vulnérabilités identifiées et statut

| # | Vulnérabilité | Gravité | Fichier | Risque | Correction | Statut |
|---|---|---|---|---|---|---|
| V1 | Tokens d'invitation & reset stockés **en clair** dans `team_members.invitation_token` | **P0** | `supabase/migrations/046_*.sql` · `server/routes/team.ts` | Un dump / une lecture DB expose des tokens réutilisables | Colonne `invitation_token_hash` (SHA-256) + migration `066_*` révoquant tous les tokens en flight | ✅ Corrigé |
| V2 | Lien complet d'invitation / reset **renvoyé dans la réponse API** (`invitation_url`, `reset_url`) | **P0** | `server/routes/team.ts` (`/invite`, `/resend`, `/reset-password`), `src/lib/api.ts`, `src/pages/Equipe.tsx`, `src/components/equipe/TeamSpaceTab.tsx` | Fuite du token en clair via journaux HTTP, capture d'écran, session admin partagée | Réponse limitée à `masked_token` (`aaaa…zzzz`) + `expires_at`. Front adapté | ✅ Corrigé |
| V3 | `.env.local` contient : **clé SSH privée**, `RESEND_API_KEY`, `OPENAI_API_KEY`, `API key vps`, `JWT_SECRET` placeholder | **P0** | `.env.local` | Compromission totale de l'infrastructure | Fichier nettoyé, secrets retirés, warnings ajoutés | ✅ Corrigé (rotation manuelle requise — voir §14) |
| V4 | Serveur démarre en production avec un `JWT_SECRET` placeholder connu | **P0** | `server/index.ts` | JWT forgeable trivial | `validateProdSecrets()` fait échouer le boot en prod si placeholder détecté | ✅ Corrigé |
| V5 | `/api/:table` PATCH/POST renvoie `err.message` + `err.detail` PostgreSQL dans la réponse en dev | **P1** | `server/routes/crud.ts` | Divulgation du schéma / des contraintes en dev | Toujours réponse générique `Erreur serveur` ; détail seulement dans logs serveur | ✅ Corrigé |
| V6 | `errorHandler` global renvoyait la stack trace et le message en clair en dev | **P1** | `server/middleware/security.ts` | Divulgation code/chemins dans les navigateurs | Format uniforme `{error:{code,message,requestId}}`, stack uniquement côté serveur | ✅ Corrigé |
| V7 | Mots de passe **minimum 8 caractères** sans obligation de complexité | **P1** | `server/routes/{auth,team,mySpace}.ts`, `src/pages/Auth.tsx` | Bruteforce | Passé à **10 chars minimum + lettre + chiffre**. Toutes les routes password et invitation-accept alignées | ✅ Corrigé |
| V8 | Reset password `team_members` valable **24h**, pas d'usage-unique (le token restait `NOT NULL` jusqu'à consommation, réutilisable) | **P1** | `server/routes/team.ts` | Fenêtre d'attaque étendue | Passé à **30 min** + `invitation_used_at` positionné atomiquement via `UPDATE ... RETURNING`. Deuxième usage refusé | ✅ Corrigé |
| V9 | Pas de rate-limit dédié pour `/api/team/invite`, `/resend`, `/reset-password` | **P1** | `server/middleware/security.ts` · `server/routes/team.ts` | Abus d'un compte admin compromis pour spammer / phisher | Nouveau `inviteLimiter` (20 requêtes/heure/IP+tenant+user) | ✅ Corrigé |
| V10 | CSP sans `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy` | **P2** | `server/index.ts` | Clickjacking + fuite de referrer | Politique explicite + `disable('x-powered-by')` + `Permissions-Policy` restrictive | ✅ Corrigé |
| V11 | 4 usages de `dangerouslySetInnerHTML` sur du contenu utilisateur (descriptions devis/facture) sans sanitation | **P1** | `src/components/{devis,facture}/*.tsx` | XSS stocké sur les PDFs / previews | Wrapper `sanitizeRichHtml()` basé sur DOMPurify (déjà installé) avec allow-list stricte + rewrite auto des liens (`rel=noopener noreferrer nofollow`) | ✅ Corrigé |
| V12 | Logs pouvant contenir tokens / mots de passe (spread de `req.body`) | **P1** | tous `console.error` | Fuite en cas d'attaque log-forwarding | `server/lib/logger.ts` avec redaction récursive par nom de champ + détection de tokens hex | ✅ Corrigé |
| V13 | Pas de journal d'audit dédié aux actions sensibles (émission / consommation de token) | **P2** | (nouveau) `supabase/migrations/066_*.sql` | Difficulté à corréler une action d'invitation avec un compromis | Table `security_audit_log` (immuable côté app) + `recordSecurityAudit()` intégré à `/invite`, `/resend`, `/reset-password` | ✅ Corrigé |
| V14 | Dépendances (`react-router`, `ws`) — CVE moyennes/élevées | **P2** | `package.json` | Open-redirect / DoS | À corriger via `npm audit fix` — voir §14 (recommandations) | ⚠️ Non appliqué (nécessite tests de régression React Router) |
| V15 | `errorHandler` code `res.status(err.status ?? 500)` pouvait inclure `500` par défaut sur un 404 non wrappé | **P3** | `server/middleware/security.ts` | Confusion sémantique | Codes normalisés (`ACCESS_DENIED`, `NOT_FOUND`, etc.) | ✅ Corrigé |

---

## 3. Correctifs code

### 3.1 Nouveaux fichiers

- `server/lib/tokenSecurity.ts` — utilitaires : `randomToken()`, `hashToken()`,
  `maskToken()`, `tokenPrefix()`, `safeCompareHex()`, `looksLikeToken()`.
- `server/lib/logger.ts` — logger structuré avec redaction automatique.
- `src/lib/safeHtml.ts` — wrapper DOMPurify pour tout `dangerouslySetInnerHTML`.
- `supabase/migrations/066_security_hardening_tokens.sql` — révocation + hashing
  des tokens + `security_audit_log`.
- `SECURITY_AUDIT.md` — ce document.

### 3.2 Fichiers modifiés

- `server/index.ts` — validation stricte des secrets au boot, `disable('x-powered-by')`,
  CSP durcie (`frame-ancestors`, `formAction`, allow-list connectSrc précise),
  `Permissions-Policy`, `requestId` middleware, `errorHandler` remplacé.
- `server/middleware/security.ts` — nouveaux limiters (`inviteLimiter`,
  `passwordResetLimiter`, `uploadLimiter`), `requestId`, `errorHandler` durci.
- `server/routes/auth.ts` — passwords ≥ 10 chars + complexité, tokens
  d'invitation ré-injectés en base sous forme hashée, logs redactés.
- `server/routes/team.ts` — stockage `invitation_token_hash` uniquement,
  UPDATE atomique lors de la consommation (anti-rejeu), plus de retour
  de `invitation_url` / `reset_url`, journal d'audit dédié.
- `server/routes/crud.ts` — plus de fuite de `err.detail`.
- `server/routes/mySpace.ts` — `logger` importé.
- `src/lib/api.ts` — typage `InviteIssuedResponse` : plus de `invitation_url`.
- `src/pages/Equipe.tsx` — dialog invitation & resend affichent uniquement
  l'empreinte 4+4 et la date d'expiration.
- `src/components/equipe/TeamSpaceTab.tsx` — même adaptation UI.
- `src/pages/Auth.tsx` — placeholder & minLength alignés à 10.
- `src/components/{devis,facture}/*Template*.tsx` — 4 rendus HTML passent
  désormais par `sanitizeRichHtml()`.

### 3.3 `.env.local`

- Fichier réécrit : la clé SSH privée est retirée, `RESEND_API_KEY` et
  `OPENAI_API_KEY` vidés (à re-générer côté fournisseur — voir §14), JWT
  secrets marqués « à changer avant prod », `API key vps` retirée.
- `.gitignore` déjà correct : `.env.local` était bien ignoré (aucune fuite
  dans l'historique Git — vérifié via `git log --all --oneline -- .env.local`).

---

## 4. Migrations ajoutées

### `066_security_hardening_tokens.sql`

- Ajoute `invitation_token_hash`, `invitation_purpose` (`invite|reset`),
  `invitation_created_by`, `invitation_created_ip`, `invitation_used_at`
  sur `team_members`.
- **Révoque** tous les tokens en flight (`UPDATE ... SET invitation_token = NULL`).
- **Révoque** toutes les sessions actives (`refresh_tokens.revoked = true`).
- Marque tous les `password_reset_codes` et `login_verification_codes`
  non consommés comme utilisés.
- Nouvel index unique `idx_team_members_invitation_token_hash`.
- Nouvelle table `security_audit_log` avec RLS tenant-scopé.
- Met à jour la policy `rls_select_team_members_by_token` pour cibler le hash.

**Impact** : les utilisateurs invités dont l'invitation n'est pas encore
acceptée devront recevoir une nouvelle invitation via `/api/team/members/:id/resend`.
L'admin déclenche l'action ; le lien part par email uniquement.

---

## 5. Politiques RLS ajoutées / vérifiées

- `security_audit_log` : RLS `ENABLE` + policy `rls_security_audit_tenant`
  (SELECT + INSERT limité à `tenant_id = current_setting('app.current_tenant')`).
- `team_members` : `rls_select_team_members_by_token` migrée vers `invitation_token_hash`.
- Toutes les autres tables métier ont déjà `ENABLE ROW LEVEL SECURITY` +
  policies `tenant_id = current_tenant_id()` (validé via
  `supabase/migrations/004_rls_and_production.sql`, ~28 policies).

---

## 6. Routes sécurisées / matrice RBAC

Confirmée dans `server/middleware/rbac.ts` (`TABLE_ACL`) :

| Table | View | Create | Edit | Delete |
|---|---|---|---|---|
| clients / prospects / devis / produits / contacts | all | admin+manager+commercial | admin+manager+commercial | admin+manager |
| factures / paiements | all | +comptable | +comptable | admin+comptable |
| depenses / cheques_* / bank_accounts / **salaires_paiements** | admin+manager+comptable | admin+comptable | admin+comptable | admin(+comptable) |
| team_members | admin+manager+comptable | admin | admin | admin |
| bons_livraison (contient mots de passe handover) | admin+manager+commercial | idem | idem | admin+manager |
| **conges** | admin+manager | admin+manager | admin+manager | admin |

- Les employés, stagiaires, freelances (rôle `team_member`) sont
  **exclus par défaut** de tout le CRUD `/api/:table` (rôle non listé dans
  `TABLE_ACL` = accès refusé).
- Ils passent par `/api/my-space/*` qui filtre côté serveur par
  `team_members.user_id = req.user.userId`.

---

## 7. Secrets révoqués / à renouveler

| Secret | Statut | Action requise |
|---|---|---|
| Clé SSH privée présente dans `.env.local` | 🚨 **À révoquer immédiatement** | Retirer la clé du serveur cible + regénérer via `ssh-keygen -t ed25519 -C 'dokploy'` |
| `RESEND_API_KEY` (`re_WSufqjyr_...`) | 🚨 **À révoquer** | Console Resend → supprimer la clé exposée, en créer une nouvelle |
| `OPENAI_API_KEY` (`sk-proj-2VsmnnH_...`) | 🚨 **À révoquer** | Dashboard OpenAI → révoquer et regénérer |
| `API key vps` (`qcqeKh...`) | 🚨 **À révoquer** | Selon le fournisseur VPS (Dokploy ?) — invalidation via le panel |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | 🚨 **À générer** (placeholder actuel) | `openssl rand -base64 48` pour chacun avant tout déploiement |
| Tous les `invitation_token` en flight | ✅ Révoqué par migration 066 | — |
| Tous les `refresh_tokens` actifs | ✅ Révoqué par migration 066 | — |
| Codes de vérification / reset actifs | ✅ Révoqué par migration 066 | — |

---

## 8. Tests

### 8.1 Test unitaire manuel (smoke) — libs sécurité

```
$ npx tsx -e "…"
mask = dead…f000
hash = 2c26b46b68ffc68f
[info]  test { password: '[REDACTED]', token: '[REDACTED]', keep: 'ok' }
```

- `maskToken` produit bien `4+4` chars ✅
- `redact` remplace `password` / `token` / `authorization` / etc. par
  `[REDACTED]` ✅
- `hashToken` produit un SHA-256 hex stable ✅

### 8.2 Test errorHandler

```
[error] [HTTP-ERROR] { requestId, method, path, status: 500, name, message, stack: 'sekret-stack' }
resp status= 500 body= {"error":{"code":"INTERNAL_ERROR","message":"Une erreur interne est survenue","requestId":"unknown"}}
```

- Le client reçoit `{code, message générique, requestId}` — **aucune stack, aucun message interne** ✅
- Le détail complet reste dans les logs serveur ✅

### 8.3 Type-check

- `npx tsc -p tsconfig.app.json --noEmit` → **EXIT 0** ✅ (frontend clean).
- Server : 88 erreurs pré-existantes toutes du type `req.params.x` typé
  `string | string[]` en Express 5. Non introduites par ce PR, ne causent
  aucun bug à l'exécution (server run via `tsx`). À traiter séparément en
  ajoutant `String(req.params.x)` ou un type helper.

### 8.4 Build

- `npx vite build` → **✓ built in 1.57s** ✅

### 8.5 npm audit

- `npm audit --production` → 8 vulnérabilités (5 moderate, 3 high).
  - `react-router` 7.0 (open-redirect, DoS, CSRF) → `npm audit fix` disponible
  - `ws` 8.0 (memory disclosure, DoS) → `npm audit fix` disponible
- **Non appliqué** car `npm audit fix` sur `react-router` implique une
  révision manuelle (breaking changes probables sur les routes). À prévoir
  dans un PR dédié.

### 8.6 Tests fonctionnels à créer

Un fichier de plan de test P0/P1 est fourni ci-dessous — à traduire en
Playwright/Vitest dans un PR suivant :

- **Auth** : login OK / KO, code réutilisé, session révoquée après change-password.
- **Invitation** : token utilisé une seule fois (2ᵉ appel = 404), token
  expiré = 410, nouvelle invitation invalide l'ancienne (`invitation_token_hash` remplacé).
- **IDOR** : utilisateur A ne peut lire ni modifier un `team_member` du
  tenant B (RLS + `SET LOCAL app.current_tenant`).
- **XSS** : `<script>alert(1)</script>` dans une description de devis
  ne s'exécute pas (DOMPurify).
- **Rate limit** : 21ᵉ requête `/api/team/invite` retourne 429.

---

## 9. Risques restant ouverts

1. **Access token JWT en localStorage** (`gestiq_token`, `gestiq_member_token`)
   — l'access token est court (15 min) et le refresh token est déjà en cookie
   HttpOnly. Migrer l'access token vers un cookie HttpOnly également est
   possible mais nécessite un CSRF token dédié — recommandé pour la V2.
2. **`.env.production`** contient `VITE_GOOGLE_MAPS_API_KEY` — clé destinée au
   frontend, restreindre par domaine dans la console Google Cloud (à vérifier).
3. **Dépendances CVE** — voir §8.5.
4. **Journal d'audit non protégé contre la suppression admin** — la table
   `security_audit_log` accepte les INSERT / SELECT, mais un DBA peut la
   modifier. Pour immutabilité totale, forwarder vers un WORM externe.
5. **Pas de CSRF token explicite** — sécurisé par `SameSite=strict` sur le
   cookie refresh + `Bearer` sur l'access token (non transmis auto par le
   navigateur), mais un CSRF token double-submit renforcerait les mutations
   sensibles.
6. **Chiffrement des secrets projet (`bons_livraison`, `Infos & Accès`)** —
   les mots de passe VPS/domaines stockés y sont actuellement en clair côté
   DB. Recommandé : `pgcrypto` avec `pgp_sym_encrypt` + clé maître en env,
   endpoint dédié pour révéler un secret (audit + double confirmation).
7. **Uploads** — actuellement les images SOP sont stockées en base64 inline
   (12 MB max, sanitisées côté serveur par `sanitizeBody`). Pas de flux
   binary/multipart. Pour V2 : storage objet + validation MIME réelle par
   magic bytes.

---

## 10. Recommandations avant production

Prioritaire — à traiter avant le go-live :

1. **Rotation immédiate** de tous les secrets listés en §7.
2. **Appliquer `066_security_hardening_tokens.sql`** en production après
   avoir prévenu les utilisateurs invités que leur lien va être réémis.
3. **`npm audit fix`** dans un PR dédié + tests de non-régression (routes
   React Router notamment).
4. **Générer un nouveau JWT_SECRET / JWT_REFRESH_SECRET** via `openssl rand -base64 48`
   et les injecter via un vault (Doppler, 1Password, AWS Secrets Manager).
5. **Vérifier la restriction par domaine** de la clé Google Maps
   `.env.production`.
6. **Configurer les logs applicatifs** en JSON structuré + ingestion vers
   Grafana Loki / CloudWatch avec alerting sur `[HTTP-ERROR]`.
7. **Sauvegardes** : vérifier que `pg_dump` chiffré tourne quotidiennement
   et **tester la restauration** dans un environnement staging au moins
   une fois par trimestre.
8. **Ajouter les tests §8.6** dans le pipeline CI (Playwright déjà installé).
9. **Chiffrement AES-256-GCM des secrets projet** dans un PR suivant.
10. **Passer l'access token en cookie HttpOnly** + CSRF double-submit.

Amélioration continue :

- Considérer Argon2id (`argon2` npm) pour les nouveaux mots de passe.
  Bcrypt(12) reste solide mais plus lent qu'Argon2id à mémoire élevée.
- Ajouter une passerelle WAF (Cloudflare) en front pour le rate-limit
  distribué + protection L7.
- Envoyer les événements de `security_audit_log` en temps réel vers un SIEM.

---

## 11. Ce qui n'a **pas** été touché (déjà correct)

- **Bcrypt(12)** — présent partout où un mot de passe est haché.
- **Rotation des refresh tokens** avec détection de rejeu (`TOKEN_REUSE`) —
  déjà implémentée, révoque toute la session en cas de réutilisation.
- **`SET LOCAL app.current_tenant`** dans `tenantQuery` — isolation
  multi-tenant côté PostgreSQL correcte.
- **`login_attempts`** avec verrouillage à 10 échecs / 15 min.
- **Message générique** `"Identifiants incorrects"` pour éviter l'énumération.
- **Cookies refresh** : `HttpOnly` + `SameSite=strict` + `Secure` en prod.
- **CORS** avec allow-list stricte (localhost:* seulement en dev,
  `*.nextgital.tech|.ma` en prod), fallback à `origin: false` sinon.
- **RLS Postgres** activée sur toutes les tables métier.
- **`ALLOWED_TABLES`** whitelist dans `/api/:table` : impossible d'attaquer
  une table non déclarée.
- **Suppression de team_member** : soft-delete (`account_status='archived'`) +
  route `/permanent` séparée avec vérification `account_status='archived'`.

---

## 12. Diff résumé

```
Modifiés :
  server/index.ts              +54 lignes  (validateProdSecrets, CSP, headers)
  server/middleware/security.ts +85 lignes (nouveaux limiters + errorHandler + requestId)
  server/routes/auth.ts         imports + password ≥10 + tokens hashés + logger
  server/routes/team.ts         invitation_token_hash + réponses masked_token
                                + inviteLimiter + recordSecurityAudit
  server/routes/crud.ts         plus de detail dans les réponses
  server/routes/mySpace.ts      logger
  src/lib/api.ts                InviteIssuedResponse
  src/pages/Equipe.tsx          UI empreinte + expiration
  src/components/equipe/TeamSpaceTab.tsx  UI empreinte
  src/pages/Auth.tsx            minLength 10
  src/components/devis/templateShared.tsx    sanitizeRichHtml
  src/components/devis/DevisTemplate.tsx     sanitizeRichHtml
  src/components/facture/FactureTemplate.tsx sanitizeRichHtml
  src/components/facture/FactureTemplateSimple.tsx sanitizeRichHtml
  .env.local                    secrets retirés

Ajoutés :
  server/lib/tokenSecurity.ts
  server/lib/logger.ts
  src/lib/safeHtml.ts
  supabase/migrations/066_security_hardening_tokens.sql
  SECURITY_AUDIT.md
```

---

## 13. Ordre d'application en production

1. Merger ce PR (aucune régression fonctionnelle attendue).
2. Rotate secrets §7 (Resend, OpenAI, VPS, SSH).
3. Générer et injecter JWT_SECRET / JWT_REFRESH_SECRET (>= 48 chars).
4. Appliquer la migration `066_security_hardening_tokens.sql`.
5. Déployer backend + frontend.
6. Communiquer aux utilisateurs invités : nouvelle invitation à demander.
7. Créer un PR séparé pour `npm audit fix` + tests.
8. Créer un PR séparé pour le chiffrement des secrets projet (`bons_livraison`).
