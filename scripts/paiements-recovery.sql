-- ================================================================
--  RÉCUPÉRATION PAIEMENTS — Recrée les paiements manquants depuis
--  les CONTRATS et les FACTURES existants.
--
--  ⚠️ FAIRE UN BACKUP AVANT :
--    docker exec <container> pg_dump -U said gestiq_prod > backup-avant-recovery.sql
--
--  Ce script est TRANSACTIONNEL — si une erreur survient, TOUT
--  est annulé (aucun paiement créé partiellement).
--
--  Il ne recrée QUE les paiements manquants (INSERT NOT IN),
--  jamais de doublons. Vous pouvez le relancer sans risque.
--
--  Usage :
--    docker cp paiements-recovery.sql <container>:/tmp/
--    docker exec -it <container> psql -U said -d gestiq_prod -f /tmp/paiements-recovery.sql
--
--  Le script recrée les paiements comme "en_attente" (à confirmer
--  ensuite via l'UI en changeant le statut à "paye" quand vous
--  retrouvez la trace du paiement réel).
-- ================================================================

BEGIN;

-- Désactive RLS pour ce recovery (superadmin only)
SET LOCAL row_security = OFF;

-- ────────────────────────────────────────────────────────────────
-- ÉTAPE 1 : Compter les paiements manquants
-- ────────────────────────────────────────────────────────────────
\echo '\n▶ ÉTAT INITIAL'
SELECT
  (SELECT COUNT(*) FROM paiements)                    AS paiements_existants,
  (SELECT COUNT(*) FROM contrats
     WHERE statut = 'actif'
     AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.contrat_id = contrats.id))
                                                       AS contrats_sans_paiement,
  (SELECT COUNT(*) FROM factures
     WHERE statut IN ('payee','envoyee','en_retard')
     AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.facture_id = factures.id))
                                                       AS factures_sans_paiement;

-- ────────────────────────────────────────────────────────────────
-- ÉTAPE 2 : Recréer les paiements manquants depuis les CONTRATS
--          Un paiement en_attente par contrat actif, montant = montant du contrat,
--          date = date_debut du contrat.
-- ────────────────────────────────────────────────────────────────
\echo '\n▶ RÉCUPÉRATION DEPUIS CONTRATS'

WITH inserted_from_contrats AS (
  INSERT INTO paiements (
    tenant_id, reference, contrat_id, client_id,
    date, montant, type_paiement, methode, status, notes,
    created_at, updated_at
  )
  SELECT
    c.tenant_id,
    'REC-CTR-' || LEFT(c.id::text, 8) || '-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS'),
    c.id,
    c.client_id,
    COALESCE(c.date_debut, CURRENT_DATE),
    c.montant,
    c.type_paiement,
    'virement'::payment_method,   -- défaut, à ajuster ensuite
    'en_attente'::payment_status,
    'Auto-recréé le ' || TO_CHAR(NOW(), 'DD/MM/YYYY') || ' depuis le contrat ' || c.numero,
    NOW(), NOW()
  FROM contrats c
  WHERE c.statut = 'actif'
    AND c.client_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.contrat_id = c.id)
  RETURNING id, tenant_id, montant
)
SELECT
  COUNT(*)          AS paiements_crees_depuis_contrats,
  SUM(montant)      AS montant_total_recupere_mad
FROM inserted_from_contrats;

-- ────────────────────────────────────────────────────────────────
-- ÉTAPE 3 : Recréer les paiements manquants depuis les FACTURES
--          (uniquement pour factures qui n'ont PAS de contrat associé,
--          car les contrats sont déjà couverts à l'étape 2)
-- ────────────────────────────────────────────────────────────────
\echo '\n▶ RÉCUPÉRATION DEPUIS FACTURES'

WITH inserted_from_factures AS (
  INSERT INTO paiements (
    tenant_id, reference, facture_id, client_id,
    date, montant, type_paiement, methode, status, notes,
    created_at, updated_at
  )
  SELECT
    f.tenant_id,
    'REC-FAC-' || LEFT(f.id::text, 8) || '-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS'),
    f.id,
    f.client_id,
    f.date_emission,
    CASE WHEN f.montant_ttc > 0 THEN f.montant_ttc ELSE f.montant_ht END,
    'autre'::payment_type,
    'virement'::payment_method,
    CASE
      WHEN f.statut = 'payee'    THEN 'paye'::payment_status
      WHEN f.statut = 'en_retard' THEN 'en_attente'::payment_status
      ELSE 'en_attente'::payment_status
    END,
    'Auto-recréé le ' || TO_CHAR(NOW(), 'DD/MM/YYYY') || ' depuis la facture ' || f.numero,
    f.created_at, NOW()
  FROM factures f
  WHERE f.statut IN ('payee','envoyee','en_retard')
    AND f.client_id IS NOT NULL
    AND CASE WHEN f.montant_ttc > 0 THEN f.montant_ttc ELSE f.montant_ht END > 0
    AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.facture_id = f.id)
  RETURNING id, tenant_id, montant
)
SELECT
  COUNT(*)          AS paiements_crees_depuis_factures,
  SUM(montant)      AS montant_total_recupere_mad
FROM inserted_from_factures;

-- ────────────────────────────────────────────────────────────────
-- ÉTAPE 4 : Bilan final
-- ────────────────────────────────────────────────────────────────
\echo '\n▶ BILAN FINAL'
SELECT
  t.slug        AS tenant,
  COUNT(p.id)   AS paiements_total,
  SUM(p.montant) AS montant_total_mad,
  MIN(p.date)   AS plus_ancien,
  MAX(p.date)   AS plus_recent
FROM tenants t
JOIN paiements p ON p.tenant_id = t.id
WHERE t.slug NOT LIKE 'tst-%'
GROUP BY t.slug
ORDER BY paiements_total DESC;

\echo '\n═══════════════════════════════════════════════════════════════'
\echo '  ⚠️  RIEN N''EST ENCORE COMMITÉ.'
\echo ''
\echo '  Si les chiffres ci-dessus vous semblent corrects :'
\echo '    → tapez  COMMIT;  puis Entrée'
\echo ''
\echo '  Si vous voulez annuler (rien n''aura été modifié) :'
\echo '    → tapez  ROLLBACK;  puis Entrée'
\echo '═══════════════════════════════════════════════════════════════\n'

-- ⚠️ COMMIT/ROLLBACK MANUEL — l'utilisateur décide
-- Ne PAS ajouter COMMIT ou ROLLBACK ici : on veut que l'utilisateur
-- valide manuellement après avoir vu le bilan.
