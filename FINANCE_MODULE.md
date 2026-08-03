# Module financier — revenus, dépenses, prévisions, transferts, ajustements

Page : **/{espace}/depenses** (`src/pages/Depenses.tsx`).
Migration : **`supabase/migrations/083_finance_module.sql`** (à appliquer AVANT de déployer le code).

---

## 1. Ce que la page répond, à tout moment

| Question | Où | Calcul |
|---|---|---|
| Argent réellement disponible | Synthèse « Réel » | Σ des soldes réels de tous les comptes |
| Solde réel d'un compte | Mes comptes | voir formule ci-dessous |
| Revenus encaissés | Synthèse « Réel » | revenus + paiements `status='paye'` du mois |
| Dépenses payées | Synthèse « Réel » | dépenses du mois |
| Revenus prévus | Synthèse « Prévisionnel » | prévisions `sens='revenu'` **actives** |
| Dépenses prévues | Synthèse « Prévisionnel » | prévisions `sens='depense'` **actives** |
| Solde prévisionnel | Synthèse « Prévisionnel » | disponible + revenus prévus − dépenses prévues |

**Actif** = statut ∈ (`prevu`, `facture`, `en_retard`). Une prévision `recu` / `paye` / `annule`
ne compte plus — c'est ce qui empêche le double comptage après encaissement.

### Formule du solde d'un compte

```
solde = solde_initial
      + Σ paiements encaissés (status = 'paye')
      + Σ revenus
      + Σ transferts entrants
      + Σ ajustements.difference
      − Σ dépenses
      − Σ transferts sortants
```

Elle existe à **deux** endroits, volontairement :

* SQL — vue `bank_accounts_with_solde` (source de vérité serveur, utilisée par les ajustements) ;
* TypeScript — `src/lib/finance/compute.ts` (ce que la page affiche, sans aller-retour réseau).

Un test d'intégration compare les deux sur un jeu de données réel
(`tests/finance-api.test.ts` → « le solde affiché par le front est identique à celui calculé par la base »).
Si une formule dérivait, le test casse.

---

## 2. Règles de cohérence

| Opération | Effet sur le solde | Compté comme revenu/dépense ? |
|---|---|---|
| Revenu encaissé | + compte destination | oui (revenu) |
| Dépense payée | − compte source | oui (dépense) |
| Transfert interne | − source, + destination (**patrimoine inchangé**) | **non** |
| Ajustement manuel | + `difference` (écart constaté) | **non** |
| Revenu prévu | **aucun** avant encaissement | non |
| Dépense prévue | **aucun** avant paiement | non |

L'ajustement est un **journal en ajout seul** : on n'écrase jamais un solde, on enregistre l'écart
(`ancien_solde`, `nouveau_solde`, `difference`, motif, note, date). L'historique est donc complet et
l'ajustement reste réversible. Ni PATCH ni DELETE ne sont exposés sur cette table (403).

---

## 3. Schéma (migration 083)

| Table | Rôle |
|---|---|
| `revenus` | encaissements hors facturation (les règlements de factures restent dans `paiements`) |
| `previsions_financieres` | revenus prévus **et** dépenses prévues (`sens` = `revenu`\|`depense`) |
| `transferts_comptes` | virement interne : une ligne porte le débit **et** le crédit |
| `bank_account_adjustments` | journal des corrections manuelles de solde |
| `depenses` (+2 colonnes) | `prevision_id` (lien avec la dépense prévue réalisée), `op_id` |

Toutes portent `tenant_id`, une politique RLS `app.current_tenant` (FORCE) et un index unique
partiel `(tenant_id, op_id)`.

### Garanties posées dans la base (pas seulement dans le code)

| Mécanisme | Ce qu'il empêche |
|---|---|
| `transferts_comptes.compte_*_id` en **ON DELETE RESTRICT** | Supprimer un compte effacerait le transfert — et ferait chuter le solde de **l'autre** compte, sans ligne d'historique. La suppression est refusée (409 explicite). |
| Index uniques `revenus(prevision_id)` / `depenses(prevision_id)` | Deux transactions pour une même prévision — le double encaissement est structurellement impossible. |
| Trigger `previsions_guard_reouverture` | Rouvrir une prévision « reçue » sans supprimer la transaction liée (donc l'encaisser deux fois), quel que soit le chemin d'écriture. |
| `READONLY_COLUMNS` (crud.ts) | Un client qui écrirait directement `revenu_id`, `montant_realise`, `date_realisation`, `prevision_id`. |

`bank_account_adjustments.bank_account_id` reste en CASCADE : ces lignes ne concernent qu'un seul
compte, aucun autre solde n'en dépend.

### Dates

`server/db/pool.ts` déclare un parseur pour l'OID 1082 : les colonnes `DATE` arrivent au client en
**`YYYY-MM-DD`**, pas en objet `Date`. Sans lui, `JSON.stringify` convertit en UTC et, sur un
serveur à UTC+1, le 1er du mois part en `"…-07-31T23:00:00.000Z"` — tous les filtres de mois et
les `<input type="date">` sont alors faux d'un jour.

---

## 4. Écritures : pourquoi une route dédiée `/api/finance`

Le CRUD générique écrit une ligne, sans logique. Quatre opérations ne sont correctes que si elles
sont indivisibles ou calculées côté serveur :

| Endpoint | Garantie |
|---|---|
| `POST /api/finance/ajustements` | l'**ancien solde est lu par le serveur** (verrou sur le compte), pas envoyé par le client |
| `POST /api/finance/transferts` | les deux comptes appartiennent au tenant, sont différents, débit+crédit dans la même ligne |
| `POST /api/finance/previsions/:id/settle` | transaction unique : crée la transaction réelle **et** solde la prévision ; `SELECT … FOR UPDATE` ⇒ un double-clic reçoit 409, jamais un second encaissement |
| `DELETE /api/finance/revenus/:id` et `/depenses/:id` | si la transaction réalisait une prévision, celle-ci **repasse en « prévu »** dans la même transaction |

`POST /api/finance/previsions/:id/cancel` / `reopen` gèrent l'annulation réversible.
`GET /api/finance/soldes` renvoie les soldes recalculés par la base (contrôle).

**Anti-doublon** : chaque écriture accepte un `op_id` généré par le client (`newOpId()`).
Rejouer la même opération (double-clic, retry réseau) renvoie la ligne déjà créée — sans
deuxième écriture. Garanti par l'index unique, pas seulement par un bouton désactivé.

### RBAC

Périmètre identique à `paiements` : **admin, manager, comptable**.
Dans `TABLE_ACL`, `create`/`delete` sont volontairement fermés (`[]`) sur `revenus`,
`transferts_comptes` et `bank_account_adjustments` : le passage par `/api/finance` est obligatoire.

Exception : tout ce qui **écrit dans `depenses`** (solder une dépense prévue, supprimer une
dépense) exige **admin ou comptable**, comme `TABLE_ACL.depenses`. Sans cela, un manager — qui ne
peut pas faire `POST /api/depenses` — aurait créé des dépenses par la bande.

---

## 5. Tests

```bash
npm run test:finance        # 23 tests — calculs purs (aucune dépendance)
npm run server              # terminal 1
npm run test:finance:api    # 26 tests d'intégration — API + PostgreSQL
```

Couvrent notamment : double-clic concurrent sur « Marquer comme reçu », rejeu d'`op_id`,
cloisonnement entre espaces, refus des rôles non financiers, réouverture d'une prévision quand
sa transaction est supprimée, concordance front/SQL, refus de supprimer un compte porteur de
transferts, impossibilité de rouvrir une prévision encaissée par un PATCH, colonnes de
réalisation non modifiables, dates sans décalage de fuseau.

---

## 6. Déploiement

1. Appliquer la migration **avant** le déploiement du code :
   ```bash
   docker exec -i <conteneur-postgres> psql -U gestiq_api -d gestiq \
     < supabase/migrations/083_finance_module.sql
   ```
   Sans elle, la création de dépense échoue (colonne `op_id` absente) et les nouvelles listes
   renvoient une erreur.
2. Redéployer l'API puis le front.
3. Vérification : `GET /api/finance/soldes` doit renvoyer les mêmes soldes que ceux affichés
   dans « Mes comptes ».

Aucune donnée existante n'est modifiée : la migration n'ajoute que des tables et des colonnes.
La vue `bank_accounts_with_solde` est redéfinie (elle n'était consommée par aucun code) et ne
compte désormais que les paiements `status='paye'` — c'est ce que faisait déjà l'affichage.
