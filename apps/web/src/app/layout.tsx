import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { LiveTicker } from "@/components/layout/LiveTicker";
import { Providers } from "@/components/layout/Providers";
import { AuthGate } from "@/components/layout/AuthGate";

export const metadata: Metadata = {
  title: "ArbitEx — Operator Dashboard",
  description: "Cross-DEX Arbitrage Platform — Operator Use Only",
  robots: "noindex, nofollow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <Providers>
          <AuthGate>
            <div className="ax-root flex h-screen overflow-hidden bg-bg text-white">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <LiveTicker />
                <TopBar />
                <main className="min-h-0 flex-1 overflow-y-auto p-6">
                  {children}
                </main>
              </div>
            </div>
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
