#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# GestiQ — Push Resend env vars to the production VPS
#
# Adds RESEND_API_KEY + RESEND_FROM to the server's .env.local
# and restarts the Node process.
#
# Usage:
#   bash scripts/deploy-env-resend.sh
#
# Prompts for:
#   • SSH target  (e.g. root@123.45.67.89)
#   • Remote app directory  (e.g. /var/www/gestiq)
#   • Process manager  (pm2 | systemd | docker | none)
#
# Skip prompts by setting these in your LOCAL .env.local:
#   GESTIQ_SSH=root@123.45.67.89
#   GESTIQ_APP_DIR=/var/www/gestiq
#   GESTIQ_PM=pm2
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

KEY="${RESEND_API_KEY:-}"
FROM="${RESEND_FROM:-NEXT GITAL <noreply@101.nextgital.tech>}"

if [[ -z "$KEY" ]]; then
  echo "✗ RESEND_API_KEY missing from your local .env.local — add it first." >&2
  exit 1
fi

SSH_TARGET="${GESTIQ_SSH:-}"
APP_DIR="${GESTIQ_APP_DIR:-}"
PM="${GESTIQ_PM:-}"

if [[ -z "$SSH_TARGET" ]]; then
  read -rp "→ SSH target (user@host): " SSH_TARGET
fi
if [[ -z "$APP_DIR" ]]; then
  read -rp "→ Remote app directory (e.g. /var/www/gestiq): " APP_DIR
fi
if [[ -z "$PM" ]]; then
  echo "→ Process manager:"
  echo "    1) pm2"
  echo "    2) systemd"
  echo "    3) docker"
  echo "    4) none"
  read -rp "  Choice [1]: " PM_CHOICE
  case "${PM_CHOICE:-1}" in
    2) PM=systemd ;;
    3) PM=docker ;;
    4) PM=none ;;
    *) PM=pm2 ;;
  esac
fi

echo
echo "════════════════════════════════════════════════"
echo "  Target  : $SSH_TARGET"
echo "  Dir     : $APP_DIR"
echo "  Restart : $PM"
echo "════════════════════════════════════════════════"
read -rp "Proceed? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

# Write a self-contained remote script and pipe it through ssh
# bash -s. The remote script reads its arguments positionally so we
# never expand untrusted strings inside an inline shell command.
ssh "$SSH_TARGET" "APP_DIR='$APP_DIR' RESEND_API_KEY='$KEY' RESEND_FROM='$FROM' PM='$PM' bash -s" <<'REMOTE'
set -euo pipefail
cd "$APP_DIR"
touch .env.local
cp .env.local ".env.local.bak.$(date +%s)" 2>/dev/null || true
grep -v -E '^RESEND_(API_KEY|FROM)=' .env.local > .env.local.tmp 2>/dev/null || true
mv .env.local.tmp .env.local
printf 'RESEND_API_KEY=%s\n' "$RESEND_API_KEY" >> .env.local
printf 'RESEND_FROM=%s\n'    "$RESEND_FROM"    >> .env.local
echo "✓ env updated"

case "$PM" in
  pm2)
    pm2 restart all >/dev/null 2>&1 || pm2 restart gestiq-server >/dev/null 2>&1 || pm2 restart 0
    echo "✓ pm2 restarted"
    ;;
  systemd)
    systemctl restart gestiq >/dev/null 2>&1 || systemctl restart gestiq-server
    echo "✓ systemd service restarted"
    ;;
  docker)
    docker restart gestiq-server >/dev/null 2>&1 || \
      docker restart "$(docker ps -q --filter name=gestiq | head -1)"
    echo "✓ docker container restarted"
    ;;
  none)
    echo "(no restart requested)"
    ;;
esac
echo "✓ done"
REMOTE

echo
echo "✓ Deployed. Verify with:"
echo "  curl -s https://api.gestnext.nextgital.tech/health/services"
echo "  → email.configured must be true"
