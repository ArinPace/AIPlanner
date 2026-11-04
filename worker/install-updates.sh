#!/usr/bin/env bash
# One-time install on an existing, idle VM. Never enrolls or changes credentials.
set -euo pipefail
test "$(id -u)" = 0
stage="$(cd "$(dirname "$0")" && pwd)"
test -f /var/lib/planner/worker.json
test -f /opt/planner/package-lock.json
test -d /opt/planner/node_modules
if systemctl is-active --quiet planner-worker; then
  echo 'Stop the idle planner-worker before installing its updater.' >&2
  exit 1
fi
backup="/opt/planner/deploy-backups/updater-$(date -u +%Y%m%d%H%M%S)"
install -d -m 0755 "$backup"
cp -p /opt/planner/package.json /opt/planner/package-lock.json "$backup/"
dropin=/etc/systemd/system/planner-worker.service.d/updates.conf
state=/var/lib/planner/worker-updates.json
if test -f "$dropin"; then cp -p "$dropin" "$backup/updates.conf"; fi
if test -f "$state"; then cp -p "$state" "$backup/worker-updates.json"; fi
dependencies_changed=false
recover() {
  if $dependencies_changed; then
    # Only paths fixed under /opt/planner; browser/account data is never touched.
    rm -rf /opt/planner/node_modules
    mv "$backup/node_modules" /opt/planner/node_modules
    cp -p "$backup/package.json" "$backup/package-lock.json" /opt/planner/
  fi
  if test -f "$backup/updates.conf"; then cp -p "$backup/updates.conf" "$dropin"; else rm -f "$dropin"; fi
  if test -f "$backup/worker-updates.json"; then cp -p "$backup/worker-updates.json" "$state"; else rm -f "$state"; fi
  for file in update-launcher.mjs auto-update.mjs update-protocol.mjs; do
    if test -f "$backup/$file"; then cp -p "$backup/$file" "/opt/planner/$file"; fi
  done
  systemctl daemon-reload
  systemctl start planner-worker
}
trap recover ERR
if ! cmp -s "$stage/package.json" /opt/planner/package.json || ! cmp -s "$stage/package-lock.json" /opt/planner/package-lock.json; then
  echo 'Installing the reviewed worker lockfile once; lifecycle scripts are disabled.'
  mv /opt/planner/node_modules "$backup/node_modules"
  dependencies_changed=true
  install -o root -g root -m 0644 "$stage/package.json" "$stage/package-lock.json" /opt/planner/
  (cd /opt/planner && npm ci --omit=dev --ignore-scripts)
fi
for file in update-launcher.mjs auto-update.mjs update-protocol.mjs; do
  node --check "$stage/$file"
  if test -f "/opt/planner/$file"; then cp -p "/opt/planner/$file" "$backup/$file"; fi
  install -o root -g root -m 0644 "$stage/$file" "/opt/planner/$file"
done
# Only downloads code as planner. No install scripts, packages or root commands.
runuser -u planner -- node --input-type=module - <<'NODE'
import {readFile,writeFile} from 'node:fs/promises'
import {stageUpdate} from '/opt/planner/auto-update.mjs'
const dataDir='/var/lib/planner'
const config=JSON.parse(await readFile(dataDir+'/worker.json','utf8'))
const revision=await stageUpdate({origin:config.origin,dataDir})
await writeFile(dataDir+'/worker-updates.json',JSON.stringify({current:null,offered:revision,blocked:[]}),{mode:0o600})
console.log('Staged worker release: '+revision)
NODE
install -d -m 0755 /etc/systemd/system/planner-worker.service.d
cat > /etc/systemd/system/planner-worker.service.d/updates.conf <<'UNIT'
[Service]
ExecStart=
ExecStart=/usr/bin/node /opt/planner/update-launcher.mjs
UNIT
systemctl daemon-reload
systemctl start planner-worker
echo "Updater installed. Existing state preserved. Recovery files: $backup"
