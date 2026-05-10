import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "$AUTO // Automated Automations",
  description:
    "The first fully autonomous liquidity organism on Solana. Trading bots, AMMs, promotions, airdrops, and reminders — all automated.",
  applicationName: "$AUTO",
  metadataBase: new URL("https://auto.example.com"),
  openGraph: {
    title: "$AUTO // Automated Automations",
    description: "Fully Automated. Zero Emotions. Maximum Extraction. Built on Solana.",
    type: "website",
  },
  themeColor: "#05030a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg text-white antialiased">
        <div className="pointer-events-none fixed inset-0 grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_85%)]" />
        <div className="pointer-events-none fixed inset-0 bg-scan-lines opacity-30" />
        <Nav />
        <main className="relative">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
