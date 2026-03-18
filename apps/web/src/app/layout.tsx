import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Providers } from "@/components/layout/Providers";
import { AuthGate } from "@/components/layout/AuthGate";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ArbitEx — Operator Dashboard",
  description: "Cross-DEX Arbitrage Platform — Operator Use Only",
  robots: "noindex, nofollow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased`}>
        <Providers>
          <AuthGate>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                <TopBar />
                <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
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
