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
  { href: "/app", label: "Início", icon: Home, hint: "Comece por aqui" },
  { href: "/app/em-alta", label: "Mais vendidos", icon: Flame, hint: "O que está vendendo agora" },
  { href: "/app/descobrir", label: "Pesquisar produtos", icon: Search, hint: "Preço, avaliações e quem vende" },
  { href: "/app/oportunidades", label: "Achados de preço", icon: TrendingUp, hint: "Bem mais baratos que o normal" },
  { href: "/app/fornecedores", label: "Meus fornecedores", icon: Store, hint: "Contatos e CNPJ conferido" },
  { href: "/app/comparar", label: "Comparar fornecedores", icon: Scale, hint: "Quem sai mais barato" },
  { href: "/app/mercado", label: "Resumo de preços", icon: BarChart3, hint: "Menor, médio e maior preço" },
  { href: "/app/calculadora", label: "Calculadora de lucro", icon: Calculator, hint: "Quanto sobra em cada venda" },
  { href: "/app/monitoramento", label: "Alertas de preço", icon: Bell, hint: "Aviso quando o preço cair" },
  { href: "/app/assistente", label: "Assistente (IA)", icon: MessagesSquare, hint: "Tire dúvidas em português" },
  { href: "/app/favoritos", label: "Salvos", icon: Bookmark, hint: "Produtos que você guardou" },
  { href: "/app/relatorios", label: "Relatórios", icon: FileText, hint: "Análises salvas" },
  { href: "/app/configuracoes", label: "Plano e conta", icon: Settings, hint: "Assinatura e dados" },
];
const TABS = [NAV[0]!, NAV[1]!, NAV[2]!, NAV[7]!];

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
  { label: "Encontrar produtos", items: ["/app/em-alta", "/app/descobrir"] },
  { label: "Fazer as contas", items: ["/app/calculadora", "/app/comparar", "/app/fornecedores"] },
  { label: "Acompanhar", items: ["/app/favoritos", "/app/relatorios"] },
  { label: "Ajuda", items: ["/app/assistente"] },
  { label: "Conta", items: ["/app/configuracoes"] },
];

function NavList({ onNavigate, unreadAlerts, admin, layoutKey = "side" }: { onNavigate?: () => void; unreadAlerts: number; admin: boolean; layoutKey?: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  return (
    <div className="space-y-6">
      {GROUPS.map((g) => (
        <div key={g.label || "home"}>
          {g.label ? <div className="mb-2 px-3 text-[12px] font-medium text-faint">{g.label}</div> : null}
          <ul className="space-y-0.5">
            {NAV.filter((n) => g.items.includes(n.href)).map((n) => {
              const on = active(n.href);
              return (
                <li key={n.href}>
                  <Link href={n.href} onClick={onNavigate} aria-current={on ? "page" : undefined} title={n.hint}
                    className={cn("group relative isolate flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] transition-colors duration-200",
                      on ? "font-semibold text-fg" : "text-muted hover:bg-tint/[0.05] hover:text-fg")}>
                    {on ? <motion.span layoutId={`nav-pill-${layoutKey}`} aria-hidden transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 -z-10 rounded-[10px] bg-tint/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" /> : null}
                    <n.icon size={16} className={cn("shrink-0 transition-colors", on ? "text-brand" : "text-faint group-hover:text-muted")} />
                    <span className="truncate">{n.label}</span>
                    {n.href === "/app/monitoramento" && unreadAlerts > 0 ? <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-[#FFFFFF]">{unreadAlerts > 99 ? "99+" : unreadAlerts}</span> : null}
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
    <div className={"glass relative overflow-hidden rounded-[22px] p-4"}>
      <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-semibold">Plano {planName}</span>
        {search ? <span className="tabular text-muted">{search.used}/{search.limit}</span> : null}</div>
      {search ? (<>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-tint/10"><div className={cn("h-full rounded-full transition-[width] duration-700", pct >= 100 ? "bg-neg" : "bg-brand")} style={{ width: `${Math.max(pct, 2)}%` }} /></div>
        <div className="mt-2 text-[11px] text-muted">pesquisas {search.period === "total" ? "gratuitas usadas" : "usadas neste mês"}</div>
      </>) : null}
      {plan === "free" ? <button onClick={() => openUpgrade()} className="btn btn-upgrade mt-4 w-full !h-10 !text-[14px] font-semibold"><Sparkles size={15} /><span>Fazer upgrade</span></button> : null}
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
        <div className="min-h-dvh lg:pl-[284px]">
          <Ambient variant="calm" />
          {/* Sidebar — desktop */}
          <aside className="glass fixed bottom-3 left-3 top-3 z-30 hidden w-[260px] flex-col overflow-hidden rounded-[22px] lg:flex">
            <Link href="/app" className="relative flex h-16 shrink-0 items-center px-5" aria-label="Worthwise — início"><Logo size={26} /></Link>
            <nav aria-label="Aplicação" className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2"><NavList unreadAlerts={props.unreadAlerts} admin={props.admin} /></nav>
            <div className="shrink-0 p-3"><UsageCard plan={props.plan} planName={props.planName} search={props.search} /></div>
          </aside>

          {/* Barra superior */}
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 px-4 lg:h-[76px] lg:px-10">
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
                className="glass h-11 w-full rounded-[12px] pl-10 pr-12 text-sm outline-none placeholder:text-faint focus:shadow-[0_0_0_3px_rgba(59,130,246,0.25)]" />
              <span className="kbd pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">/</span>
            </form>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle size="sm" className="mr-1" />
              <Link href="/app/monitoramento" className="icon-btn relative" aria-label={`Alertas${props.unreadAlerts ? ` (${props.unreadAlerts} não lidos)` : ""}`}>
                <Bell size={18} />{props.unreadAlerts > 0 ? <span className="absolute right-1 top-1 size-2.5 rounded-full bg-brand ring-2 ring-[var(--bg)]" /> : null}
              </Link>
              <Profile user={props.user} />
            </div>
          </header>

          <main id="conteudo" key={path} className="relative animate-[page-in_0.45s_cubic-bezier(0.16,1,0.3,1)] px-5 pb-32 pt-8 lg:px-12 lg:pb-20 lg:pt-12">
                        <div className="page-stagger mx-auto max-w-[1120px]">{props.children}</div>
          </main>

          {/* Navegação inferior — mobile */}
          <nav aria-label="Atalhos" className="glass fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 rounded-[22px] p-1.5 lg:hidden">
            {TABS.map((t) => {
              const on = t.href === "/app" ? path === "/app" : path.startsWith(t.href);
              return (
                <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
                  className={cn("relative isolate flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] transition-colors active:scale-95", on ? "font-semibold text-fg" : "text-muted")}>
                  {on ? <motion.span layoutId="tab-pill" aria-hidden transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 -z-10 rounded-[16px] bg-tint/[0.09]" /> : null}
                  <t.icon size={19} className={on ? "text-brand" : undefined} />{({ "/app": "Início", "/app/em-alta": "Em alta", "/app/descobrir": "Pesquisar", "/app/calculadora": "Lucro" } as Record<string, string>)[t.href] ?? t.label}
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
