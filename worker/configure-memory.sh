#!/usr/bin/env bash
set -euo pipefail
# Keep the VM reachable during image-heavy reviews. Never reformat an existing
# swap file, and reserve RAM for SSH and the host connection.
if [ ! -e /swapfile ]; then
  available=$(df --output=avail -k / | tail -n 1 | tr -d ' ')
  if [ "$available" -gt 6291456 ]; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
fi
if [ -f /swapfile ]; then
  swapon --show=NAME --noheadings | grep -Fxq /swapfile || swapon /swapfile
  grep -Fq '/swapfile none swap sw 0 0' /etc/fstab || printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab
fi
total=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
install -d -m 0755 /etc/systemd/system/planner-worker.service.d
cat > /etc/systemd/system/planner-worker.service.d/memory.conf <<EOF
[Service]
MemoryHigh=$((total * 3 / 4))K
MemoryMax=$((total * 7 / 8))K
MemorySwapMax=4G
EOF
systemctl daemon-reload
