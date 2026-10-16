#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
install -d -m 0755 /etc/needrestart/conf.d
install -m 0644 /home/ubuntu/planner-worker/needrestart-planner.conf /etc/needrestart/conf.d/planner.conf
apt-get update
apt-get install -y ca-certificates curl gnupg xvfb x11vnc novnc websockify openbox
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main' > /etc/apt/sources.list.d/nodesource.list
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
printf '%s\n' 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
apt-get update
apt-get install -y nodejs cloudflared
id planner >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/planner --shell /bin/bash planner
chmod 700 /var/lib/planner
install -d -m 0755 /opt/planner
cp -a /home/ubuntu/planner-worker/. /opt/planner/
bash /opt/planner/install-google-chrome.sh
cd /opt/planner
npm ci --omit=dev
npx playwright install-deps chromium
install -d -o planner -g planner -m 0700 /var/lib/planner/browsers /var/lib/planner/workspace
runuser -u planner -- env PLAYWRIGHT_BROWSERS_PATH=/var/lib/planner/browsers npx playwright install chromium
cat > /etc/systemd/system/planner-display.service <<'UNIT'
[Unit]
Description=AI Planner private virtual display
[Service]
User=planner
ExecStart=/usr/bin/Xvfb :99 -screen 0 1440x900x24 -nolisten tcp
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/planner-desktop.service <<'UNIT'
[Unit]
Requires=planner-display.service
After=planner-display.service
[Service]
User=planner
Environment=DISPLAY=:99
ExecStart=/usr/bin/openbox
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/planner-vnc.service <<'UNIT'
[Unit]
Requires=planner-display.service
After=planner-display.service
[Service]
User=planner
ExecStart=/usr/bin/x11vnc -display :99 -localhost -nopw -forever -shared -rfbport 5900 -quiet
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/planner-view.service <<'UNIT'
[Unit]
Requires=planner-vnc.service
After=planner-vnc.service
[Service]
User=planner
ExecStart=/usr/bin/websockify --web=/usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/planner-worker.service <<'UNIT'
[Unit]
Description=AI Planner isolated account worker
Requires=planner-display.service planner-view.service
After=network-online.target planner-display.service planner-view.service
Wants=network-online.target
[Service]
User=planner
WorkingDirectory=/var/lib/planner/workspace
Environment=HOME=/var/lib/planner
Environment=DISPLAY=:99
Environment=PLAYWRIGHT_BROWSERS_PATH=/var/lib/planner/browsers
Environment=PLANNER_DATA_DIR=/var/lib/planner
ExecStart=/usr/bin/node /opt/planner/main.mjs
Restart=on-failure
RestartSec=10
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/planner /tmp
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now planner-display planner-desktop planner-vnc planner-view
