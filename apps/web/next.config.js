/** @type {import('next').NextConfig} */
const INTERNAL_API = process.env.INTERNAL_API_URL || "http://api:3001";
const AVAX_RPC = process.env.NEXT_PUBLIC_AVAX_RPC_URL || "https://api.avax.network/ext/bc/C/rpc";

const nextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_AVAX_RPC_URL: AVAX_RPC,
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${INTERNAL_API}/api/v1/:path*` },
      { source: "/api/auth/:path*", destination: `${INTERNAL_API}/api/v1/auth/:path*` },
      { source: "/health", destination: `${INTERNAL_API}/health` },
      { source: "/socket.io/:path*", destination: `${INTERNAL_API}/socket.io/:path*` },
    ];
  },
  async headers() {
    const rpcHost = (() => { try { return new URL(AVAX_RPC).origin; } catch { return ""; } })();
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `connect-src 'self' wss://api.bitrunner3001.com ${rpcHost} https://api.coingecko.com https://api.dexscreener.com https://api.snowtrace.io https://api.avax.network`,
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
