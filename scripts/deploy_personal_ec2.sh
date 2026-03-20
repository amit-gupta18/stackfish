#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WWW_DIR="$ROOT_DIR/www"
WORKER_DIR="$ROOT_DIR/cloud-run-worker"
APP_HOST="${APP_HOST:-_}"
WEB_PORT="${WEB_PORT:-3000}"
WORKER_PORT="${WORKER_PORT:-8080}"
WEB_PROCESS_NAME="${WEB_PROCESS_NAME:-stackfish-web}"
WORKER_PROCESS_NAME="${WORKER_PROCESS_NAME:-stackfish-worker}"
CONFIG_FILE="$WWW_DIR/config.env"
NGINX_SITE_NAME="${NGINX_SITE_NAME:-stackfish}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

echo "==> Installing system packages"
sudo apt-get update
sudo apt-get install -y git curl build-essential g++ nginx

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

require_command node
require_command npm
require_command pm2

echo "==> Installing worker dependencies"
cd "$WORKER_DIR"
npm install

echo "==> Installing web dependencies"
cd "$WWW_DIR"
npm install

if [ ! -f "$CONFIG_FILE" ]; then
  echo "==> Creating $CONFIG_FILE from example"
  cp "$WWW_DIR/config.env.example" "$CONFIG_FILE"
fi

if ! grep -q '^CLOUD_EXECUTE_URL=' "$CONFIG_FILE"; then
  printf '\nCLOUD_EXECUTE_URL=http://127.0.0.1:%s/compute\n' "$WORKER_PORT" >> "$CONFIG_FILE"
else
  sed -i "s#^CLOUD_EXECUTE_URL=.*#CLOUD_EXECUTE_URL=http://127.0.0.1:${WORKER_PORT}/compute#" "$CONFIG_FILE"
fi

echo "==> Ensuring problem directories exist"
mkdir -p "$ROOT_DIR/PROBLEMS" "$ROOT_DIR/SOLUTIONS"

echo "==> Building web app"
cd "$WWW_DIR"
npm run build

echo "==> Starting worker with pm2"
cd "$WORKER_DIR"
pm2 delete "$WORKER_PROCESS_NAME" >/dev/null 2>&1 || true
WORKER_USE_GCS=false PORT="$WORKER_PORT" pm2 start server.js --name "$WORKER_PROCESS_NAME"

echo "==> Starting web app with pm2"
cd "$WWW_DIR"
pm2 delete "$WEB_PROCESS_NAME" >/dev/null 2>&1 || true
pm2 start npm --name "$WEB_PROCESS_NAME" -- start -- --hostname 127.0.0.1 --port "$WEB_PORT"

echo "==> Writing nginx config"
sudo tee "/etc/nginx/sites-available/${NGINX_SITE_NAME}" >/dev/null <<EOF
server {
    listen 80;
    server_name ${APP_HOST};

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

sudo ln -sfn "/etc/nginx/sites-available/${NGINX_SITE_NAME}" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "==> Saving pm2 process list"
pm2 save
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null || true

cat <<EOF

Deployment complete.

Web URL:
  http://${APP_HOST}

Processes:
  pm2 status

Important:
  Edit ${CONFIG_FILE} to add your API keys if you have not already.
  After changing config.env, run:
    cd ${WWW_DIR}
    npm run build
    pm2 restart ${WEB_PROCESS_NAME}

EOF
