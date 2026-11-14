"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [["/admin", "Visão geral"], ["/admin/usuarios", "Usuários"], ["/admin/integracoes", "Integrações"], ["/admin/planos", "Planos e cotas"],
  ["/admin/fornecedores", "Fornecedores"], ["/admin/blog", "Blog"], ["/admin/logs", "Logs"], ["/admin/configuracoes", "Configurações"]] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Administração" className="mx-auto flex max-w-[1280px] gap-1 overflow-x-auto px-3 lg:px-7">
      {ITEMS.map(([href, label]) => {
        const on = href === "/admin" ? path === href : path.startsWith(href);
        return <Link key={href} href={href} aria-current={on ? "page" : undefined}
          className={cn("shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors", on ? "border-brand font-medium text-fg" : "border-transparent text-muted hover:text-fg")}>{label}</Link>;
      })}
    </nav>
  );
}
