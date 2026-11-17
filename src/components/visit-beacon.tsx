"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Envia uma contagem anônima por página vista (ver /api/track). Não roda no painel administrativo. */
export function VisitBeacon() {
  const path = usePathname();
  useEffect(() => {
    if (typeof navigator === "undefined" || location.hostname.startsWith("admin.") || path.startsWith("/control")) return;
    const t = setTimeout(() => {
      const body = JSON.stringify({ p: location.pathname, r: document.referrer });
      try { navigator.sendBeacon?.("/api/track", body) || fetch("/api/track", { method: "POST", body, keepalive: true }); } catch { /* ignora */ }
    }, 400);
    return () => clearTimeout(t);
  }, [path]);
  return null;
}
