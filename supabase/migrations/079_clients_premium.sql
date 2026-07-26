-- ================================================================
--  Migration 079 : clients.is_premium
--
--  Distingue les clients « Premium » des clients « Standard ».
--  Les clients Premium sont mis en avant (badge + tri en tête de la
--  liste des clients).
--
--  Idempotent : ADD COLUMN IF NOT EXISTS. Safe à re-runner.
-- ================================================================
BEGIN;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_clients_premium
  ON clients (tenant_id, is_premium);

COMMIT;
