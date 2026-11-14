"use client";
import { BarChart3, Bell, Bookmark, Calculator, FileText, Home, LogOut, Menu as MenuIcon, MessagesSquare, Scale, Search, Settings, ShieldCheck, Sparkles, Store, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ToastProvider } from "@/components/ui/toast";
import type { PlanInfo } from "@/lib/plans";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { UpgradeProvider, useUpgrade } from "./upgrade";

const NAV = [
  { href: "/app", label: "Início", icon: Home },
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
const TABS = [NAV[0]!, NAV[1]!, NAV[6]!, NAV[8]!];

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

function NavList({ onNavigate, unreadAlerts, admin }: { onNavigate?: () => void; unreadAlerts: number; admin: boolean }) {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  return (
    <ul className="space-y-0.5">
      {NAV.map((n) => (
        <li key={n.href}>
          <Link href={n.href} onClick={onNavigate} aria-current={active(n.href) ? "page" : undefined}
            className={cn("group flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] transition-colors duration-150",
              active(n.href) ? "bg-white/8 font-medium text-fg" : "text-muted hover:bg-white/4 hover:text-fg")}>
            <n.icon size={16} className={cn("shrink-0 transition-colors", active(n.href) ? "text-brand" : "text-faint group-hover:text-muted")} />
            <span className="truncate">{n.label}</span>
            {n.href === "/app/monitoramento" && unreadAlerts > 0 ? <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-black">{unreadAlerts > 99 ? "99+" : unreadAlerts}</span> : null}
          </Link>
        </li>
      ))}
      {admin ? (
        <li className="!mt-3 border-t border-line pt-3">
          <Link href="/admin" onClick={onNavigate} className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] text-muted hover:bg-white/4 hover:text-fg"><ShieldCheck size={16} className="text-faint" /> Administração</Link>
        </li>
      ) : null}
    </ul>
  );
}

function UsageCard({ plan, planName, search }: Pick<ShellProps, "plan" | "planName" | "search">) {
  const { openUpgrade } = useUpgrade();
  const pct = search && search.limit > 0 ? Math.min(100, (search.used / search.limit) * 100) : 0;
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3.5">
      <div className="flex items-center justify-between text-xs"><span className="font-medium">Plano {planName}</span>
        {search ? <span className="tabular text-muted">{search.used}/{search.limit}</span> : null}</div>
      {search ? (<>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/8"><div className={cn("h-full rounded-full transition-[width] duration-500", pct >= 100 ? "bg-neg" : "bg-brand")} style={{ width: `${pct}%` }} /></div>
        <div className="mt-2 text-[11px] text-faint">pesquisas {search.period === "total" ? "gratuitas usadas" : "usadas neste mês"}</div>
      </>) : null}
      {plan === "free" ? <button onClick={() => openUpgrade()} className="btn btn-primary btn-sm mt-3 w-full"><Sparkles size={13} /> Fazer upgrade</button> : null}
    </div>
  );
}

function Profile({ user }: { user: ShellProps["user"] }) {
  const router = useRouter();
  const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase();
  return (
    <Menu>
      <MenuTrigger className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-surface-3 text-sm font-medium outline-none transition-transform active:scale-95" aria-label="Menu do perfil">
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
  return (
    <ToastProvider>
      <UpgradeProvider plans={props.plans} currentPlan={props.plan}>
        <div className="min-h-dvh lg:pl-[248px]">
          {/* Sidebar — desktop */}
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
            <Link href="/app" className="flex h-16 items-center px-5" aria-label="Worthwise — início"><Logo size={26} /></Link>
            <nav aria-label="Aplicação" className="flex-1 overflow-y-auto px-3 pb-4"><NavList unreadAlerts={props.unreadAlerts} admin={props.admin} /></nav>
            <div className="p-3"><UsageCard plan={props.plan} planName={props.planName} search={props.search} /></div>
          </aside>

          {/* Barra superior */}
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-ink/85 px-4 backdrop-blur-md lg:h-16 lg:px-8">
            <D.Root open={drawer} onOpenChange={setDrawer}>
              <D.Trigger className="btn btn-ghost -ml-2 !px-2.5 lg:hidden" aria-label="Abrir menu"><MenuIcon size={20} /></D.Trigger>
              <D.Portal>
                <D.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
                <D.Content className="glass fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[320px] flex-col rounded-r-2xl outline-none data-[state=open]:animate-[drawer-in_0.3s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[drawer-out_0.2s_ease-in]">
                  <div className="flex h-14 items-center justify-between px-4"><D.Title asChild><Logo size={26} /></D.Title>
                    <D.Close className="btn btn-ghost !px-2.5" aria-label="Fechar menu"><X size={20} /></D.Close></div>
                  <D.Description className="sr-only">Navegação da aplicação</D.Description>
                  <nav aria-label="Aplicação" className="flex-1 overflow-y-auto px-3"><NavList onNavigate={() => setDrawer(false)} unreadAlerts={props.unreadAlerts} admin={props.admin} /></nav>
                  <div className="p-3 pb-[max(12px,env(safe-area-inset-bottom))]"><UsageCard plan={props.plan} planName={props.planName} search={props.search} /></div>
                </D.Content>
              </D.Portal>
            </D.Root>
            <Link href="/app" className="lg:hidden" aria-label="Worthwise — início"><Logo size={24} /></Link>
            <form action="/app/descobrir" className="relative ml-auto hidden w-full max-w-md md:block lg:ml-0">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
              <input name="q" aria-label="Pesquisar produtos" placeholder="Pesquisar produtos…" maxLength={120}
                className="h-10 w-full rounded-xl border border-line bg-surface-2/70 pl-10 pr-3 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-faint focus:border-brand focus:bg-surface-2 focus:shadow-[0_0_0_3px_rgba(255,121,0,0.16)]" />
            </form>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/app/monitoramento" className="btn btn-ghost relative !px-2.5" aria-label={`Alertas${props.unreadAlerts ? ` (${props.unreadAlerts} não lidos)` : ""}`}>
                <Bell size={18} />{props.unreadAlerts > 0 ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand ring-2 ring-ink" /> : null}
              </Link>
              <Profile user={props.user} />
            </div>
          </header>

          <main id="conteudo" key={path} className="animate-[page-in_0.28s_cubic-bezier(0.16,1,0.3,1)] px-4 pb-28 pt-6 lg:px-8 lg:pb-16 lg:pt-8">
            <div className="mx-auto max-w-[1240px]">{props.children}</div>
          </main>

          {/* Navegação inferior — mobile */}
          <nav aria-label="Atalhos" className="glass fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 rounded-2xl p-1.5 lg:hidden">
            {TABS.map((t) => {
              const on = t.href === "/app" ? path === "/app" : path.startsWith(t.href);
              return (
                <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
                  className={cn("flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] transition-colors active:bg-white/8", on ? "text-fg" : "text-muted")}>
                  <t.icon size={19} className={on ? "text-brand" : undefined} />{t.label.split(" ")[0]}
                </Link>
              );
            })}
            <button onClick={() => setDrawer(true)} className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] text-muted active:bg-white/8"><MenuIcon size={19} />Mais</button>
          </nav>
        </div>
      </UpgradeProvider>
    </ToastProvider>
  );
}
