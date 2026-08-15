#!/usr/bin/env bash
#
# Provision SendToWP on a fresh Debian 12 VM (tuned for a GCP e2-micro).
#
#   curl -fsSL https://raw.githubusercontent.com/aryan4209/SendToWP/main/scripts/gcp-bootstrap.sh | sudo bash
#
# Re-running it pulls the latest code, rebuilds, and restarts - so this is the
# update command too. It never regenerates JWT_SECRET, so re-running will not
# sign you out.
set -euo pipefail

REPO="${REPO:-https://github.com/aryan4209/SendToWP.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/sendtowp}"
DATA_DIR="${DATA_DIR:-/var/lib/sendtowp}"
SERVICE_USER="${SERVICE_USER:-sendtowp}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run this with sudo." >&2
  exit 1
fi

# ---------------------------------------------------------------- swap -------
# e2-micro has 1 GB of RAM. The Vite build will be OOM-killed without swap.
if ! swapon --show | grep -q '/swapfile'; then
  log "Creating a 2 GB swap file"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >>/etc/sysctl.conf
else
  log "Swap already configured, skipping"
fi

# ------------------------------------------------------------ packages -------
log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg openssl python3 make g++ >/dev/null

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
  log "Installing Node.js ${NODE_MAJOR}"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    >/etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
fi
log "Node $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------- user -------
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  log "Creating service user '${SERVICE_USER}'"
  useradd --system --create-home --home-dir /home/"$SERVICE_USER" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$DATA_DIR"

# --------------------------------------------------------------- source ------
if [[ -d "$APP_DIR/.git" ]]; then
  log "Updating existing checkout"
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/${BRANCH}"
else
  log "Cloning ${REPO}"
  rm -rf "$APP_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

# ------------------------------------------------------------------ env ------
ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log "Writing ${ENV_FILE} with a fresh JWT secret"
  cat >"$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000

JWT_SECRET=$(openssl rand -hex 48)
JWT_EXPIRES_IN=30d
BCRYPT_ROUNDS=12
ALLOW_REGISTRATION=true

DB_PATH=${DATA_DIR}/sendtowp.db
WHATSAPP_AUTH_PATH=${DATA_DIR}/whatsapp-auth

RETRY_LIMIT=3
RATE_LIMIT=1200

# Empty: the server also serves the built client, so there is no cross origin.
CLIENT_ORIGIN=

# cloudflared runs on localhost and forwards the real client IP.
TRUST_PROXY=1
EOF
else
  log "Keeping existing ${ENV_FILE} (secret unchanged)"
fi

# ---------------------------------------------------------------- build ------
log "Installing dependencies and building the client (slow on e2-micro)"
cd "$APP_DIR"
# Prefer the lockfile. `npm ci` refuses to run when package.json and
# package-lock.json disagree, so fall back to a plain install and refresh it.
npm ci --no-audit --no-fund || {
  log "Lockfile out of sync with package.json, falling back to 'npm install'"
  npm install --no-audit --no-fund
}
NODE_OPTIONS=--max-old-space-size=768 npm run build
npm prune --omit=dev

# Code is read-only to the service account; only the env file is privileged.
# This must come before the env file is locked down, or the recursive chmod
# would make JWT_SECRET world readable.
chown -R root:root "$APP_DIR"
chmod -R a+rX "$APP_DIR"
chown root:"$SERVICE_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

# --------------------------------------------------------------- systemd -----
log "Installing the systemd service"
cat >/etc/systemd/system/sendtowp.service <<EOF
[Unit]
Description=SendToWP - WhatsApp message scheduler
Documentation=https://github.com/aryan4209/SendToWP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}/server
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${APP_DIR}/server/index.js
Restart=always
RestartSec=5

# The process only ever needs to write to its data directory.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true
ReadWritePaths=${DATA_DIR}

StandardOutput=journal
StandardError=journal
SyslogIdentifier=sendtowp

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sendtowp >/dev/null
systemctl restart sendtowp

sleep 4
if systemctl is-active --quiet sendtowp; then
  log "SendToWP is running on http://127.0.0.1:3000"
else
  echo "Service failed to start. Logs:" >&2
  journalctl -u sendtowp -n 40 --no-pager >&2
  exit 1
fi

# ----------------------------------------------------------- cloudflared -----
if ! command -v cloudflared >/dev/null 2>&1; then
  log "Installing cloudflared"
  ARCH=$(dpkg --print-architecture)
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" \
    -o /tmp/cloudflared.deb
  dpkg -i /tmp/cloudflared.deb >/dev/null
  rm -f /tmp/cloudflared.deb
fi

cat <<'NEXT'

────────────────────────────────────────────────────────────────
 The app is up on localhost:3000 but is not reachable yet.
 Finish by creating the tunnel (needs a domain on Cloudflare):

   cloudflared tunnel login
   cloudflared tunnel create sendtowp
   cloudflared tunnel route dns sendtowp wp.yourdomain.com

 Then write /etc/cloudflared/config.yml:

   tunnel: sendtowp
   credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
   ingress:
     - hostname: wp.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404

   sudo cloudflared service install
   sudo systemctl enable --now cloudflared

 Useful commands:
   sudo journalctl -u sendtowp -f      # logs
   sudo systemctl restart sendtowp     # restart
────────────────────────────────────────────────────────────────
NEXT
