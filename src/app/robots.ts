import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/api", "/auth", "/entrar", "/cadastro", "/recuperar-senha", "/redefinir-senha"] }],
    sitemap: `${publicEnv.appUrl}/sitemap.xml`,
  };
}
