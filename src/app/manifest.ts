import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Worthwise", short_name: "Worthwise", description: "Encontre produtos que realmente valem a pena.",
    start_url: "/app", scope: "/", display: "standalone", background_color: "#090909", theme_color: "#090909", lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
