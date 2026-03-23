#!/usr/bin/env bash
set -euo pipefail

# ArbitEx VPS Maintenance — runs via cron to keep disk healthy.
# Install: crontab -e → 0 4 * * * /root/arbitex/scripts/vps-maintenance.sh >> /var/log/arbitex-maintenance.log 2>&1

echo "=== ArbitEx Maintenance $(date) ==="

cd /root/arbitex 2>/dev/null || cd "$(dirname "$0")/.."

# 1. Prune dangling Docker images + stopped containers + unused networks
echo "[1/5] Pruning Docker..."
docker image prune -f
docker container prune -f
docker network prune -f
docker builder prune -f --keep-storage=2GB

# 2. Truncate container logs over 10MB (belt + suspenders for log rotation)
echo "[2/5] Truncating oversized container logs..."
for logfile in $(find /var/lib/docker/containers/ -name "*.log" -size +10M 2>/dev/null); do
  echo "  Truncating $logfile ($(du -sh "$logfile" | cut -f1))"
  truncate -s 0 "$logfile"
done

# 3. Clean system journals older than 3 days
echo "[3/5] Cleaning journal logs..."
journalctl --vacuum-time=3d --vacuum-size=50M 2>/dev/null || true

# 4. Clean apt/apk cache
echo "[4/5] Cleaning package cache..."
apt-get clean 2>/dev/null || apk cache clean 2>/dev/null || true
rm -rf /tmp/* /var/tmp/* 2>/dev/null || true

# 5. Report disk usage
echo "[5/5] Disk usage:"
df -h / | tail -1
echo ""
docker system df
echo ""
echo "=== Maintenance complete ==="
