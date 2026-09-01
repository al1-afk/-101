#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  GestiQ — Appliquer la migration 093 (50 SOPs Claude Code / DevOps / IA) en PROD
#
#  Lance la migration 093 (50 SOPs : dev, IA, designer, media buyer,
#  marketing, livraison) sur la base de production via SSH + docker exec.
#
#  Idempotent : safe à re-runner (WHERE NOT EXISTS sur chaque INSERT).
#
#  Usage :
#    bash scripts/apply-prod-sop-claude-code.sh
#
#  Prompts (skippables via env) :
#    GESTIQ_SSH         → cible SSH (ex. root@gestnext.nextgital.tech)
#    GESTIQ_PG_CONT     → nom du conteneur Postgres (Dokploy)
#    GESTIQ_PG_USER     → utilisateur (défaut postgres)
#    GESTIQ_PG_DB       → base (défaut gestiq)
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

cd "$(dirname "$0")/.."

SQL_FILE="supabase/migrations/093_seed_sops_claude_code_devops.sql"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "✗ Fichier introuvable : $SQL_FILE" >&2
  exit 1
fi

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

SSH_TARGET="${GESTIQ_SSH:-}"
PG_CONT="${GESTIQ_PG_CONT:-}"
PG_USER="${GESTIQ_PG_USER:-postgres}"
PG_DB="${GESTIQ_PG_DB:-gestiq}"

if [[ -z "$SSH_TARGET" ]]; then
  read -rp "→ Cible SSH (user@host) : " SSH_TARGET
fi

if [[ -z "$PG_CONT" ]]; then
  echo ""
  echo "ℹ Détection des conteneurs Postgres sur la cible…"
  CANDIDATES=$(ssh -o ConnectTimeout=10 "$SSH_TARGET" "docker ps --format '{{.Names}}' 2>/dev/null | grep -i -E 'postgres|pg|db' || true")
  if [[ -n "$CANDIDATES" ]]; then
    echo "  Candidats détectés :"
    echo "$CANDIDATES" | sed 's/^/    /'
    echo ""
  fi
  read -rp "→ Nom du conteneur Postgres : " PG_CONT
fi

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  SSH         : $SSH_TARGET"
echo "  Conteneur   : $PG_CONT"
echo "  Utilisateur : $PG_USER"
echo "  Base        : $PG_DB"
echo "  SQL         : $SQL_FILE ($(wc -l < "$SQL_FILE") lignes)"
echo "════════════════════════════════════════════════════════════════════"
read -rp "Continuer ? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Annulé."; exit 0; }

echo ""
echo "▶ Sanity-check : ping Postgres dans le conteneur…"
if ! ssh "$SSH_TARGET" "docker exec '$PG_CONT' pg_isready -U '$PG_USER' -d '$PG_DB'" ; then
  echo "✗ Postgres pas prêt — vérifier le nom du conteneur ou les credentials." >&2
  exit 1
fi

echo "▶ Backup avant migration…"
BKP_NAME="pre-sop-claude-code-$(date +%Y%m%d-%H%M%S).sql"
ssh "$SSH_TARGET" "docker exec '$PG_CONT' pg_dump -U '$PG_USER' -d '$PG_DB' --no-owner --no-acl" > "/tmp/$BKP_NAME"
echo "  ✓ Backup local : /tmp/$BKP_NAME ($(du -h /tmp/$BKP_NAME | cut -f1))"

echo "▶ Application de la migration 093…"
cat "$SQL_FILE" | ssh "$SSH_TARGET" "docker exec -i '$PG_CONT' psql -U '$PG_USER' -d '$PG_DB' -v ON_ERROR_STOP=1"

echo ""
echo "▶ Vérification — comptage des SOPs Designer :"
ssh "$SSH_TARGET" "docker exec '$PG_CONT' psql -U '$PG_USER' -d '$PG_DB' -c \"SELECT category, COUNT(DISTINCT slug) AS slugs FROM sops GROUP BY category ORDER BY 2 DESC;\""

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  ✅ Migration appliquée avec succès"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Étapes suivantes :"
echo "  1. Visiter https://101.nextgital.tech/<slug>/sop"
echo "  2. Vérifier les catégories Développeur (+30), IA (+8), Designer (+7)"
echo ""
echo "Rollback (si besoin) :"
echo "  cat /tmp/$BKP_NAME | ssh $SSH_TARGET \\"
echo "    \"docker exec -i $PG_CONT psql -U $PG_USER -d $PG_DB\""
