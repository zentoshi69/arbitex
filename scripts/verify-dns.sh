#!/usr/bin/env bash
# Verify DNS for bitrunner3001.com and api.bitrunner3001.com
# Usage: ./scripts/verify-dns.sh [expected_ip]

set -e

DOMAINS=("bitrunner3001.com" "api.bitrunner3001.com")
EXPECTED_IP="${1:-}"

echo "Checking DNS for bitrunner3001.com..."
echo ""

for domain in "${DOMAINS[@]}"; do
  echo -n "  $domain: "
  if ip=$(dig +short "$domain" A 2>/dev/null | head -1); then
    if [[ -n "$ip" ]]; then
      echo "$ip"
      if [[ -n "$EXPECTED_IP" && "$ip" != "$EXPECTED_IP" ]]; then
        echo "    ⚠ Expected $EXPECTED_IP"
      fi
    else
      echo "no A record"
    fi
  else
    echo "dig failed"
  fi
done

echo ""
if [[ -z "$EXPECTED_IP" ]]; then
  echo "To verify against your server IP: ./scripts/verify-dns.sh YOUR_SERVER_IP"
fi
