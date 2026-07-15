-- ================================================================
--  DIAGNOSTIC PAIEMENTS — À exécuter sur la DB de production
--
--  Usage :
--    # 1. Se connecter au VPS
--    ssh votre-vps
--
--    # 2. Trouver le conteneur postgres
--    docker ps | grep postgres
--
--    # 3. Copier ce script dans le conteneur
--    docker cp paiements-diagnostic.sql <container>:/tmp/
--
--    # 4. L'exécuter
--    docker exec -it <container> psql -U said -d gestiq_prod -f /tmp/paiements-diagnostic.sql
--
--  Ce script NE MODIFIE RIEN — lecture seule. Il diagnostique :
--    - Nombre de paiements par tenant
--    - Contrats sans paiement associé
--    - Factures sans paiement associé
--    - Dernières opérations d'écriture sur paiements (si audit disponible)
-- ================================================================

\pset border 2
\pset format aligned
\pset expanded off

-- Désactive RLS pour ce diagnostic (superadmin only)
SET row_security = OFF;

\echo '\n═══════════════════════════════════════════════════════════════'
\echo '  1. NOMBRE DE PAIEMENTS PAR TENANT'
\echo '═══════════════════════════════════════════════════════════════\n'
SELECT
  t.slug                                          AS tenant_slug,
  t.name                                          AS tenant_name,
  COALESCE(p.count, 0)                            AS paiements_count,
  COALESCE(p.total_montant, 0)                    AS total_montant_mad,
  COALESCE(p.oldest, NULL)                        AS plus_ancien,
  COALESCE(p.newest, NULL)                        AS plus_recent
FROM tenants t
LEFT JOIN (
  SELECT tenant_id,
         COUNT(*) AS count,
         SUM(montant) AS total_montant,
         MIN(date) AS oldest,
         MAX(date) AS newest
  FROM paiements
  GROUP BY tenant_id
) p ON p.tenant_id = t.id
WHERE t.slug NOT LIKE 'tst-%'
  AND t.slug NOT IN ('demo','admin-gestiq')
ORDER BY paiements_count DESC, t.slug;

\echo '\n═══════════════════════════════════════════════════════════════'
\echo '  2. CONTRATS SANS PAIEMENT ASSOCIÉ (candidats à recréation)'
\echo '═══════════════════════════════════════════════════════════════\n'
SELECT
  t.slug           AS tenant,
  c.numero         AS contrat,
  c.client         AS client_nom,
  c.montant        AS montant_mad,
  c.date_debut,
  c.date_fin,
  c.statut,
  (SELECT COUNT(*) FROM paiements p WHERE p.contrat_id = c.id) AS nb_paiements
FROM contrats c
JOIN tenants t ON t.id = c.tenant_id
WHERE t.slug NOT LIKE 'tst-%'
  AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.contrat_id = c.id)
ORDER BY t.slug, c.date_debut DESC;

\echo '\n═══════════════════════════════════════════════════════════════'
\echo '  3. FACTURES SANS PAIEMENT ASSOCIÉ'
\echo '═══════════════════════════════════════════════════════════════\n'
SELECT
  t.slug           AS tenant,
  f.numero         AS facture,
  f.date_emission,
  f.montant_ttc    AS montant_ttc,
  f.statut,
  (SELECT COUNT(*) FROM paiements p WHERE p.facture_id = f.id) AS nb_paiements
FROM factures f
JOIN tenants t ON t.id = f.tenant_id
WHERE t.slug NOT LIKE 'tst-%'
  AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.facture_id = f.id)
  AND f.statut IN ('payee', 'envoyee', 'en_retard')
ORDER BY t.slug, f.date_emission DESC
LIMIT 100;

\echo '\n═══════════════════════════════════════════════════════════════'
\echo '  4. DERNIÈRE ACTIVITÉ SUR PAIEMENTS (activity_logs si dispo)'
\echo '═══════════════════════════════════════════════════════════════\n'
SELECT
  t.slug        AS tenant,
  al.entity_type,
  al.action,
  al.actor_id,
  al.metadata,
  al.created_at
FROM activity_logs al
JOIN tenants t ON t.id = al.tenant_id
WHERE al.entity_type = 'paiement'
   OR (al.metadata::text ILIKE '%paiement%' AND al.created_at > NOW() - INTERVAL '90 days')
ORDER BY al.created_at DESC
LIMIT 50;

\echo '\n═══════════════════════════════════════════════════════════════'
\echo '  5. RÉSUMÉ GLOBAL'
\echo '═══════════════════════════════════════════════════════════════\n'
SELECT
  (SELECT COUNT(*) FROM paiements)                                AS total_paiements,
  (SELECT COUNT(*) FROM contrats WHERE statut = 'actif')          AS contrats_actifs,
  (SELECT COUNT(*) FROM factures WHERE statut IN ('payee','envoyee','en_retard')) AS factures_actives,
  (SELECT SUM(montant) FROM contrats WHERE statut = 'actif')      AS montant_contrats_actifs,
  (SELECT SUM(montant_ttc) FROM factures WHERE statut = 'payee')  AS montant_factures_payees;

\echo '\n═══════════════════════════════════════════════════════════════'
\echo '  ✅ DIAGNOSTIC TERMINÉ — Aucune donnée modifiée.'
\echo '═══════════════════════════════════════════════════════════════\n'
