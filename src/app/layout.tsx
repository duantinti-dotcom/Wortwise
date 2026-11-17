import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { publicEnv } from "@/lib/env";
import { ASSET_GUARD_SCRIPT, INVIEW_SCRIPT, THEME_SCRIPT } from "@/components/theme/script";
import { GlassFilters } from "@/components/ambient";
import { GlassLight } from "@/components/ui/glass-light";
import { VisitBeacon } from "@/components/visit-beacon";
import "./globals.css";

const title = "Worthwise — Melhores produtos para revender e fornecedores para revenda";
const description = "Worthwise mostra os melhores produtos para revender: mais vendidos do Mercado Livre, Shopee, Amazon e TikTok Shop, fornecedores para revenda mais baratos, histórico de preço e calculadora de lucro.";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: { default: title, template: "%s · Worthwise" },
  description,
  applicationName: "Worthwise",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icon-96.png", sizes: "96x96", type: "image/png" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-icon.png",
  },
  keywords: ["Worthwise", "melhores produtos para revender", "fornecedores para revenda", "produtos para revenda", "o que vender", "produtos para vender", "produtos mais vendidos", "mais vendidos Mercado Livre", "mais vendidos Shopee", "mais vendidos TikTok Shop", "mais vendidos Amazon",
    "o que vender na Shopee", "o que vender no Mercado Livre", "produtos para revender", "calculadora de lucro", "como encontrar produtos para vender", "site para encontrar produtos para vender"],
  category: "business",
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "pt_BR", siteName: "Worthwise", title, description, url: "/", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Worthwise" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  // Google Search Console: defina GOOGLE_SITE_VERIFICATION com o código da "tag HTML".
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION || "_VxPjI0n1XJiukDuyDw8LYSge7QAI6HM3isVt4iWhWY" },
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
