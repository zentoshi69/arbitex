# DNS Setup for bitrunnar3001.com

Add these records at your domain registrar or DNS provider (Cloudflare, Namecheap, GoDaddy, etc.).

## Required records

Replace `YOUR_SERVER_IP` with your server's public IPv4 address (e.g. `123.45.67.89`).

| Type | Name/Host | Value/Content | TTL | Proxy (Cloudflare) |
|------|------------|---------------|-----|--------------------|
| A | `@` | `YOUR_SERVER_IP` | 300 | DNS only (grey cloud) |
| A | `api` | `YOUR_SERVER_IP` | 300 | DNS only (grey cloud) |

- `@` = root domain (`bitrunnar3001.com`)
- `api` = subdomain (`api.bitrunnar3001.com`)

## Provider-specific notes

### Cloudflare
1. Add site → Add records
2. **A** record: Name `@`, IPv4 `YOUR_SERVER_IP`, Proxy status **DNS only** (grey cloud) for both records
3. Use **DNS only** so Let's Encrypt can validate via HTTP on port 80

### Namecheap
1. Domain List → Manage → Advanced DNS
2. Add **A Record**: Host `@`, Value `YOUR_SERVER_IP`
3. Add **A Record**: Host `api`, Value `YOUR_SERVER_IP`

### GoDaddy
1. DNS → Manage DNS
2. Add **A** record: Type A, Name `@`, Value `YOUR_SERVER_IP`
3. Add **A** record: Type A, Name `api`, Value `YOUR_SERVER_IP`

### Google Domains / Squarespace
1. DNS → Custom records
2. Add A record for `@` and `api` pointing to `YOUR_SERVER_IP`

## Verify DNS

After saving (propagation can take 5–60 minutes):

```bash
# From your machine or server
dig +short bitrunnar3001.com
dig +short api.bitrunnar3001.com
```

Both should return your server IP. Then proceed with deployment.
