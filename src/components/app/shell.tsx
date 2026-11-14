"use client";
import { BarChart3, Bell, Flame, Bookmark, Calculator, FileText, Home, LogOut, Menu as MenuIcon, MessagesSquare, Scale, Search, Settings, ShieldCheck, Sparkles, Store, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Dialog as D } from "radix-ui";
import { useEffect, useState, type ReactNode } from "react";
import { Ambient } from "@/components/ambient";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ToastProvider } from "@/components/ui/toast";
import type { PlanInfo } from "@/lib/plans";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { UpgradeProvider, useUpgrade } from "./upgrade";

const NAV = [
  { href: "/app", label: "Início", icon: Home },
  { href: "/app/em-alta", label: "Em alta", icon: Flame },
  { href: "/app/descobrir", label: "Descobrir produtos", icon: Search },
  { href: "/app/oportunidades", label: "Oportunidades", icon: TrendingUp },
  { href: "/app/fornecedores", label: "Fornecedores", icon: Store },
  { href: "/app/comparar", label: "Comparar", icon: Scale },
  { href: "/app/mercado", label: "Análise de mercado", icon: BarChart3 },
  { href: "/app/calculadora", label: "Calculadora de lucro", icon: Calculator },
  { href: "/app/monitoramento", label: "Monitoramento", icon: Bell },
  { href: "/app/assistente", label: "Assistente Worthwise", icon: MessagesSquare },
  { href: "/app/favoritos", label: "Favoritos", icon: Bookmark },
  { href: "/app/relatorios", label: "Relatórios", icon: FileText },
  { href: "/app/configuracoes", label: "Planos e configurações", icon: Settings },
];
const TABS = [NAV[0]!, NAV[1]!, NAV[2]!, NAV[9]!];

export interface ShellProps {
  user: { email: string; name: string | null; avatarUrl: string | null };
  plan: string;
  planName: string;
  search: { used: number; limit: number; period: string } | null;
  unreadAlerts: number;
  admin: boolean;
  plans: PlanInfo[];
  children: ReactNode;
}

const GROUPS: { label: string; items: string[] }[] = [
  { label: "", items: ["/app"] },
  { label: "Produtos", items: ["/app/em-alta", "/app/descobrir", "/app/oportunidades", "/app/mercado"] },
  { label: "Fornecedores", items: ["/app/fornecedores", "/app/comparar"] },
  { label: "Ferramentas", items: ["/app/calculadora", "/app/monitoramento", "/app/assistente"] },
  { label: "Biblioteca", items: ["/app/favoritos", "/app/relatorios"] },
  { label: "Conta", items: ["/app/configuracoes"] },
];

function NavList({ onNavigate, unreadAlerts, admin, layoutKey = "side" }: { onNavigate?: () => void; unreadAlerts: number; admin: boolean; layoutKey?: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => (
        <div key={g.label || "home"}>
          {g.label ? <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">{g.label}</div> : null}
          <ul className="space-y-0.5">
            {NAV.filter((n) => g.items.includes(n.href)).map((n) => {
              const on = active(n.href);
              return (
                <li key={n.href}>
                  <Link href={n.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
                    className={cn("group relative isolate flex h-9 items-center gap-3 rounded-[9px] px-3 text-[13.5px] transition-colors duration-200",
                      on ? "font-semibold text-fg" : "text-muted hover:bg-tint/[0.05] hover:text-fg")}>
                    {on ? <motion.span layoutId={`nav-pill-${layoutKey}`} aria-hidden transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 -z-10 rounded-[9px] border border-tint/10 bg-tint/[0.07]" /> : null}
                    <n.icon size={16} className={cn("shrink-0 transition-colors", on ? "text-brand" : "text-faint group-hover:text-muted")} />
                    <span className="truncate">{n.label}</span>
                    {n.href === "/app/em-alta" ? <span aria-hidden className="ml-auto size-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,121,0,0.9)]" /> : null}
                    {n.href === "/app/monitoramento" && unreadAlerts > 0 ? <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-[#1a0900]">{unreadAlerts > 99 ? "99+" : unreadAlerts}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {admin ? (
        <Link href="/admin" onClick={onNavigate} className="flex h-9 items-center gap-3 rounded-xl border border-dashed border-tint/10 px-3 text-[13.5px] text-muted hover:border-tint/20 hover:text-fg"><ShieldCheck size={16} className="text-faint" /> Administração</Link>
      ) : null}
    </div>
  );
}

function UsageCard({ plan, planName, search }: Pick<ShellProps, "plan" | "planName" | "search">) {
  const { openUpgrade } = useUpgrade();
  const pct = search && search.limit > 0 ? Math.min(100, (search.used / search.limit) * 100) : 0;
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border p-4", plan === "free" ? "edge-grad edge-brand bg-[linear-gradient(180deg,rgba(255,121,0,0.10),rgba(255,121,0,0.02))]" : "border-tint/8 bg-tint/[0.03]")}>
      <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-semibold"><Sparkles size={13} className="text-brand" />Plano {planName}</span>
        {search ? <span className="tabular text-muted">{search.used}/{search.limit}</span> : null}</div>
      {search ? (<>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-tint/10"><div className={cn("h-full rounded-full transition-[width] duration-700", pct >= 100 ? "bg-neg" : "bg-gradient-to-r from-brand to-brand-hi")} style={{ width: `${Math.max(pct, 2)}%` }} /></div>
        <div className="mt-2 text-[11px] text-muted">pesquisas {search.period === "total" ? "gratuitas usadas" : "usadas neste mês"}</div>
      </>) : null}
      {plan === "free" ? <button onClick={() => openUpgrade()} className="btn btn-primary btn-sm mt-3.5 w-full">Fazer upgrade</button> : null}
    </div>
  );
}

function Profile({ user }: { user: ShellProps["user"] }) {
  const router = useRouter();
  const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase();
  return (
    <Menu>
      <MenuTrigger className="icon-btn overflow-hidden bg-gradient-to-br from-brand/40 to-brand/10 text-sm font-semibold outline-none" aria-label="Menu do perfil">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : initial}
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{user.email}</MenuLabel>
        <MenuItem asChild><Link href="/app/configuracoes"><Settings size={15} /> Planos e configurações</Link></MenuItem>
        <MenuSeparator />
        <MenuItem danger onSelect={async () => { await supabaseBrowser().auth.signOut(); router.replace("/"); router.refresh(); }}><LogOut size={15} /> Sair</MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function AppShell(props: ShellProps) {
  const [drawer, setDrawer] = useState(false);
  const path = usePathname();
  // Atalho "/" foca a busca global (como em ferramentas profissionais).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      document.getElementById("ww-global-search")?.focus();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  return (
    <ToastProvider>
      <UpgradeProvider plans={props.plans} currentPlan={props.plan}>
        <div className="min-h-dvh lg:pl-[276px]">
          <Ambient variant="calm" />
          {/* Sidebar — desktop */}
          <aside className="glass fixed bottom-3 left-3 top-3 z-30 hidden w-[252px] flex-col overflow-hidden rounded-[24px] lg:flex">
            <Link href="/app" className="relative flex h-16 shrink-0 items-center px-5" aria-label="Worthwise — início"><Logo size={26} /></Link>
            <nav aria-label="Aplicação" className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2"><NavList unreadAlerts={props.unreadAlerts} admin={props.admin} /></nav>
            <div className="shrink-0 p-3"><UsageCard plan={props.plan} planName={props.planName} search={props.search} /></div>
          </aside>

          {/* Barra superior */}
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-tint/[0.07] bg-ink/70 px-4 backdrop-blur-2xl backdrop-saturate-150 lg:h-[72px] lg:border-0 lg:bg-transparent lg:bg-gradient-to-b lg:from-ink lg:via-ink/85 lg:to-transparent lg:px-10 lg:backdrop-blur-none">
            <D.Root open={drawer} onOpenChange={setDrawer}>
              <D.Trigger className="btn btn-ghost -ml-2 !px-2.5 lg:hidden" aria-label="Abrir menu"><MenuIcon size={20} /></D.Trigger>
              <D.Portal>
                <D.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
                <D.Content className="lg glass-strong fixed inset-y-2 left-2 z-50 flex w-[86vw] max-w-[320px] flex-col rounded-2xl outline-none data-[state=open]:animate-[drawer-in_0.3s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[drawer-out_0.2s_ease-in]">
                  <div className="flex h-14 items-center justify-between px-4"><D.Title asChild><Logo size={26} /></D.Title>
                    <D.Close className="btn btn-ghost !px-2.5" aria-label="Fechar menu"><X size={20} /></D.Close></div>
                  <D.Description className="sr-only">Navegação da aplicação</D.Description>
                  <nav aria-label="Aplicação" className="min-h-0 flex-1 overflow-y-auto px-3"><NavList layoutKey="drawer" onNavigate={() => setDrawer(false)} unreadAlerts={props.unreadAlerts} admin={props.admin} /></nav>
                  <div className="shrink-0 p-3 pb-[max(12px,env(safe-area-inset-bottom))]"><UsageCard plan={props.plan} planName={props.planName} search={props.search} /></div>
                </D.Content>
              </D.Portal>
            </D.Root>
            <Link href="/app" className="lg:hidden" aria-label="Worthwise — início"><Logo size={24} /></Link>
            <form action="/app/descobrir" className="relative ml-auto hidden w-full max-w-md md:block lg:ml-0">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
              <input id="ww-global-search" name="q" aria-label="Pesquisar produtos" placeholder="Pesquisar produtos…" maxLength={120}
                className="liquid glass-lens h-10 w-full rounded-full pl-10 pr-14 text-sm outline-none transition-[border-color,box-shadow,background-color,width] duration-300 placeholder:text-faint hover:border-tint/[0.14] focus:border-brand focus:bg-tint/[0.06] focus:shadow-[0_0_0_4px_rgba(255,121,0,0.14)] " />
              <span className="kbd pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">/</span>
            </form>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle size="sm" className="mr-1" />
              <Link href="/app/monitoramento" className="icon-btn relative" aria-label={`Alertas${props.unreadAlerts ? ` (${props.unreadAlerts} não lidos)` : ""}`}>
                <Bell size={18} />{props.unreadAlerts > 0 ? <span className="absolute right-1 top-1 size-2.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,121,0,0.9)] ring-2 ring-[var(--bg)]" /> : null}
              </Link>
              <Profile user={props.user} />
            </div>
          </header>

          <main id="conteudo" key={path} className="relative animate-[page-in_0.45s_cubic-bezier(0.16,1,0.3,1)] px-4 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(45%_100%_at_70%_0%,rgba(255,121,0,0.06),transparent)]" />
            <div className="mx-auto max-w-[1240px]">{props.children}</div>
          </main>

          {/* Navegação inferior — mobile */}
          <nav aria-label="Atalhos" className="glass glass-lens fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 rounded-full p-1.5 lg:hidden">
            {TABS.map((t) => {
              const on = t.href === "/app" ? path === "/app" : path.startsWith(t.href);
              return (
                <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
                  className={cn("relative isolate flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] transition-colors active:scale-95", on ? "font-semibold text-fg" : "text-muted")}>
                  {on ? <motion.span layoutId="tab-pill" aria-hidden transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 -z-10 rounded-full bg-tint/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" /> : null}
                  <t.icon size={19} className={on ? "text-brand" : undefined} />{t.href === "/app/em-alta" ? "Em alta" : t.label.split(" ")[0]}
                </Link>
              );
            })}
            <button onClick={() => setDrawer(true)} className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] text-muted active:bg-tint/8"><MenuIcon size={19} />Mais</button>
          </nav>
        </div>
      </UpgradeProvider>
    </ToastProvider>
  );
}
