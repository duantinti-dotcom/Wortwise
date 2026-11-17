"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DropdownMenu, Popover } from "radix-ui";
import {
  Activity, BadgeDollarSign, Eye, Bell, BrainCircuit, CalendarRange, ChevronDown, Coins, Filter, Gauge, LayoutDashboard, LogOut, Menu, Moon,
  RefreshCw, ScrollText, Server, Settings2, ShieldCheck, Sun, Users, X,
} from "lucide-react";
import { LogoMark } from "@/components/logo";
import { setTheme } from "@/components/theme/theme-toggle";
import { PRESETS, rangeQuery, type Bucket } from "@/lib/control/range";
import { relative } from "@/lib/control/format";
import { cn } from "@/lib/utils";

type Area = "overview" | "subscribers" | "finance" | "funnel" | "security" | "gecko" | "ai" | "infra" | "alerts" | "audit" | "settings";
const NAV: { group: string; items: { area: Area; href: string; label: string; icon: typeof Activity }[] }[] = [
  { group: "Negócio", items: [
    { area: "overview", href: "", label: "Visão executiva", icon: LayoutDashboard },
    { area: "subscribers", href: "/assinantes", label: "Assinantes", icon: Users },
    { area: "finance", href: "/financeiro", label: "Financeiro", icon: BadgeDollarSign },
    { area: "funnel", href: "/funil", label: "Funil de conversão", icon: Filter },
    { area: "overview", href: "/visitantes", label: "Visitantes e cadastros", icon: Eye },
  ] },
  { group: "Operação", items: [
    { area: "security", href: "/seguranca", label: "Security Center", icon: ShieldCheck },
    { area: "gecko", href: "/gecko", label: "GeckoAPI", icon: Coins },
    { area: "ai", href: "/ia", label: "Inteligência artificial", icon: BrainCircuit },
    { area: "infra", href: "/infraestrutura", label: "Infraestrutura", icon: Server },
  ] },
  { group: "Controle", items: [
    { area: "alerts", href: "/alertas", label: "Alertas", icon: Bell },
    { area: "audit", href: "/auditoria", label: "Auditoria", icon: ScrollText },
    { area: "settings", href: "/configuracoes", label: "Configurações", icon: Settings2 },
  ] },
];

/** Páginas que usam o filtro global de período. */
const RANGED = new Set(["", "/visitantes", "/assinantes", "/financeiro", "/funil", "/seguranca", "/gecko", "/ia"]);

export function ControlShell({ base, email, areas, openIncidents, children }: { base: string; email: string; areas: string[]; openIncidents: number; children: ReactNode }) {
  const path = usePathname();
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawer = drawerPath === path; // fecha sozinho ao navegar
  const setDrawer = (open: boolean) => setDrawerPath(open ? path : null);
  const rel = (path.startsWith("/control") ? path.slice(8) : path) || "";
  const current = rel === "/" ? "" : rel;

  const nav = (
    <nav aria-label="Painel" className="flex flex-col gap-5">
      {NAV.map((g) => {
        const items = g.items.filter((i) => areas.includes(i.area));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <div className="c-eyebrow mb-2 px-3">{g.group}</div>
            <ul className="flex flex-col gap-0.5">
              {items.map((i) => {
                const on = i.href === "" ? current === "" : current.startsWith(i.href);
                return (
                  <li key={i.href}>
                    <Link href={`${base}${i.href}` || "/"} className="c-nav-item" aria-current={on ? "page" : undefined} prefetch={false}>
                      <i.icon size={16} aria-hidden />
                      <span className="flex-1 truncate">{i.label}</span>
                      {i.area === "alerts" && openIncidents > 0 && <span className="c-badge c-badge-crit h-[18px] px-1.5 text-[10.5px]">{openIncidents}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href={base || "/"} className="flex items-center gap-2.5 px-2.5" prefetch={false}>
      <LogoMark size={24} />
      <span className="flex flex-col leading-tight">
        <span className="text-[14px] font-semibold tracking-[-0.02em]">Worthwise</span>
        <span className="c-eyebrow">control · v1</span>
      </span>
    </Link>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Barra lateral (desktop) */}
      <aside className="c-rail sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-7 overflow-y-auto px-3 py-5 lg:flex">
        {brand}
        {nav}
        <div className="mt-auto"><Account base={base} email={email} /></div>
      </aside>

      {/* Gaveta (celular/tablet) */}
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] lg:hidden" />
          <Dialog.Content className="ctl c-rail fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-[300px] flex-col gap-6 overflow-y-auto px-3 py-4 lg:hidden" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Navegação</Dialog.Title>
            <div className="flex items-center justify-between">{brand}<Dialog.Close className="c-btn c-btn-ghost c-btn-icon" aria-label="Fechar menu"><X size={16} /></Dialog.Close></div>
            {nav}
            <div className="mt-auto"><Account base={base} email={email} /></div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="c-topbar sticky top-0 z-40">
          <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-3 sm:px-5 lg:px-8">
            <button type="button" className="c-btn c-btn-ghost c-btn-icon lg:hidden" onClick={() => setDrawer(true)} aria-label="Abrir menu"><Menu size={18} /></button>
            <div className="lg:hidden"><LogoMark size={22} /></div>
            <span className="c-badge c-badge-neutral hidden gap-2 sm:inline-flex"><span className="c-live" aria-hidden />Ao vivo</span>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              {RANGED.has(current) && <RangeControl />}
              <AutoRefresh />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1480px] flex-1 px-3 py-7 sm:px-5 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

function Account({ base, email }: { base: string; email: string }) {
  const toggleTheme = (e: React.MouseEvent) => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    setTheme(next, { x: e.clientX, y: e.clientY });
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="c-nav-item w-full">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold" style={{ background: "#fff", color: "#000" }}>
          {email.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[12.5px]">{email}</span>
        <ChevronDown size={14} aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="ctl c-menu" side="top" align="start" sideOffset={6}>
          <DropdownMenu.Label className="c-faint px-2 py-1.5 text-[11.5px]">Proprietário · MFA ativo</DropdownMenu.Label>
          <DropdownMenu.Item className="c-menu-item" onSelect={(e) => toggleTheme(e as unknown as React.MouseEvent)}>
            <Sun size={14} className="hidden [[data-theme=dark]_&]:block" /><Moon size={14} className="hidden [[data-theme=light]_&]:block" />Alternar tema
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="c-menu-sep" />
          <form action={`${base}/sair`} method="post">
            <DropdownMenu.Item className="c-menu-item c-neg" asChild>
              <button type="submit" className="w-full"><LogOut size={14} />Sair</button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Filtro global de período: 24 h, 7/30/90/365 dias, intervalo personalizado, agrupamento e comparação. */
export function RangeControl() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const params = Object.fromEntries(sp.entries());
  const r = sp.get("r") ?? (sp.get("from") ? "custom" : "30d");
  const g = (sp.get("g") ?? "") as Bucket | "";
  const cmp = sp.get("cmp") !== "0";
  const go = (patch: Record<string, string | null>) => start(() => router.push(`${path}${rangeQuery(params, patch)}`, { scroll: false }));
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");
  const [today] = useState(() => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10));

  return (
    <div className={cn("flex min-w-0 items-center gap-2 transition-opacity", pending && "opacity-60")}>
      <div className="c-seg hidden md:inline-flex" role="group" aria-label="Período">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" aria-pressed={r === p.key} onClick={() => go({ r: p.key, from: null, to: null })}>{p.key === "24h" ? "24h" : p.key.replace("d", "d")}</button>
        ))}
      </div>
      <select className="c-select h-8 w-auto md:hidden" aria-label="Período" value={r === "custom" ? "" : r}
        onChange={(e) => e.target.value && go({ r: e.target.value, from: null, to: null })}>
        {r === "custom" && <option value="">Personalizado</option>}
        {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <Popover.Root>
        <Popover.Trigger className={cn("c-btn h-8", r === "custom" && "c-btn-primary")} aria-label="Intervalo personalizado e opções">
          <CalendarRange size={14} /><span className="hidden sm:inline">{r === "custom" ? `${from.split("-").reverse().slice(0, 2).join("/")} – ${to.split("-").reverse().slice(0, 2).join("/")}` : "Personalizar"}</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="ctl c-menu w-[290px] p-3" align="end" sideOffset={6}>
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (from && to && from <= to) go({ r: null, from, to }); }}>
              <div className="c-label">Intervalo personalizado (horário de Brasília)</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[12px]"><span className="c-muted">De</span>
                  <input type="date" className="c-input" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} required /></label>
                <label className="flex flex-col gap-1 text-[12px]"><span className="c-muted">Até</span>
                  <input type="date" className="c-input" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} required /></label>
              </div>
              <button type="submit" className="c-btn c-btn-primary">Aplicar intervalo</button>
              <div className="c-menu-sep" />
              <div className="c-label">Agrupar por</div>
              <div className="c-seg" role="group" aria-label="Agrupar por">
                {([["", "Auto"], ["day", "Dia"], ["week", "Semana"], ["month", "Mês"]] as const).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={g === v} onClick={() => go({ g: v || null })}>{l}</button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-3 text-[13px]">
                <span className="c-soft">Comparar com o período anterior</span>
                <button type="button" role="switch" aria-checked={cmp} className="c-switch" onClick={() => go({ cmp: cmp ? "0" : null })}><span className="sr-only">Comparar</span></button>
              </label>
            </form>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/** Atualização periódica (60 s) com indicação do último carregamento. Preferência salva no navegador. */
function AutoRefresh() {
  const router = useRouter();
  const [on, setOn] = useState(() => { try { return typeof localStorage === "undefined" || localStorage.getItem("ww-ctl-auto") !== "0"; } catch { return true; } });
  const [at, setAt] = useState(() => new Date().toISOString());
  const [, tick] = useState(0);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!on) return;
    timer.current = setInterval(() => {
      if (document.visibilityState === "visible") start(() => { router.refresh(); setAt(new Date().toISOString()); });
    }, 60_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [on, router]);
  const refresh = () => start(() => { router.refresh(); setAt(new Date().toISOString()); });
  const toggle = () => { const n = !on; setOn(n); try { localStorage.setItem("ww-ctl-auto", n ? "1" : "0"); } catch { /* ignora */ } };
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="c-btn h-8 gap-1.5 px-2.5" onClick={refresh} aria-label="Atualizar agora" title={`Carregado ${relative(at)}`}>
        <RefreshCw size={14} className={cn(pending && "animate-spin")} />
        <span className="c-muted hidden text-[12px] xl:inline">{relative(at)}</span>
      </button>
      <button type="button" className={cn("c-btn h-8 px-2.5 text-[12px]", on ? "c-btn-ghost" : "")} onClick={toggle} aria-pressed={on}
        title={on ? "Atualização automática a cada 60 s (clique para pausar)" : "Atualização automática pausada"}>
        <Gauge size={14} /><span className="hidden sm:inline">{on ? "Auto" : "Pausado"}</span>
      </button>
    </div>
  );
}
