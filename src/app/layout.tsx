import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { publicEnv } from "@/lib/env";
import { INVIEW_SCRIPT, THEME_SCRIPT } from "@/components/theme/script";
import { GlassFilters } from "@/components/ambient";
import { GlassLight } from "@/components/ui/glass-light";
import "./globals.css";

const title = "Worthwise — Encontre produtos que realmente valem a pena";
const description = "Inteligência comercial para quem vende online: descubra o que vender, compare fornecedores pelo custo total, acompanhe preços e calcule quanto você realmente lucra.";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: { default: title, template: "%s · Worthwise" },
  description,
  applicationName: "Worthwise",
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "pt_BR", siteName: "Worthwise", title, description, url: "/", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Worthwise" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#0F0F11", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /><script dangerouslySetInnerHTML={{ __html: INVIEW_SCRIPT }} /></head>
      <body className="min-h-dvh"><GlassFilters /><GlassLight />{children}</body>
    </html>
  );
}
