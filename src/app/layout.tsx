import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { publicEnv } from "@/lib/env";
import { ASSET_GUARD_SCRIPT, INVIEW_SCRIPT, THEME_SCRIPT } from "@/components/theme/script";
import { GlassFilters } from "@/components/ambient";
import { GlassLight } from "@/components/ui/glass-light";
import { VisitBeacon } from "@/components/visit-beacon";
import "./globals.css";

const title = "Worthwise — Descubra o que vender online e quanto você vai lucrar";
const description = "Encontre produtos para vender: veja os mais vendidos do Mercado Livre, Shopee, Amazon e TikTok Shop, o histórico de preço, quanto sobra em cada venda e tire dúvidas com a Wise, assistente de vendas com IA.";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: { default: title, template: "%s · Worthwise" },
  description,
  applicationName: "Worthwise",
  keywords: ["o que vender", "produtos para vender", "produtos mais vendidos", "mais vendidos Mercado Livre", "mais vendidos Shopee", "mais vendidos TikTok Shop", "mais vendidos Amazon",
    "o que vender na Shopee", "o que vender no Mercado Livre", "produtos para revender", "calculadora de lucro", "como encontrar produtos para vender", "site para encontrar produtos para vender"],
  category: "business",
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
      <head><script dangerouslySetInnerHTML={{ __html: ASSET_GUARD_SCRIPT }} /><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /><script dangerouslySetInnerHTML={{ __html: INVIEW_SCRIPT }} /></head>
      <body className="min-h-dvh"><GlassFilters /><GlassLight />{children}<VisitBeacon /></body>
    </html>
  );
}
