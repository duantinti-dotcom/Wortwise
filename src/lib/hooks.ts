"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Carregamento assíncrono com estados de erro e recarga — nunca fica carregando para sempre. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const ref = useRef(loader);
  useEffect(() => { ref.current = loader; });
  useEffect(() => {
    let alive = true;
    const timeout = setTimeout(() => { if (alive) setState((s) => (s.loading ? { data: null, error: "A operação demorou demais. Verifique sua conexão.", loading: false } : s)); }, 20000);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia o estado ao recarregar
    setState((s) => ({ ...s, loading: true, error: null }));
    ref.current().then(
      (data) => { if (alive) setState({ data, error: null, loading: false }); },
      (e: unknown) => { if (alive) setState({ data: null, error: e instanceof Error && e.message ? e.message : "Não foi possível carregar.", loading: false }); },
    ).finally(() => clearTimeout(timeout));
    return () => { alive = false; clearTimeout(timeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload, setData: (data: T) => setState({ data, error: null, loading: false }) };
}

export interface ApiFailure { code: string; message: string; [k: string]: unknown }

/** fetch JSON com timeout e erro padronizado em português. */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }> {
  try {
    const res = await fetch(url, {
      ...init, signal: init?.signal ?? AbortSignal.timeout(45000),
      headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
    const body = (await res.json().catch(() => null)) as { error?: ApiFailure } | T | null;
    if (!res.ok) {
      const err = (body as { error?: ApiFailure } | null)?.error;
      return { ok: false, error: err ?? { code: "internal", message: res.status === 401 ? "Sua sessão expirou. Entre novamente." : "Algo deu errado. Tente novamente." } };
    }
    return { ok: true, data: body as T };
  } catch (e) {
    const timeout = (e as Error)?.name === "TimeoutError";
    return { ok: false, error: { code: timeout ? "timeout" : "offline", message: timeout ? "A operação demorou demais. Tente novamente." : "Sem conexão. Verifique sua internet e tente novamente." } };
  }
}

/** Mensagem amigável para erros do banco (cotas, permissão). */
export function dbMessage(e: { message?: string } | null | undefined, fallback = "Não foi possível salvar."): string {
  const m = e?.message ?? "";
  if (m.includes("quota_exceeded")) return "Você atingiu o limite do seu plano para este recurso.";
  if (m.includes("duplicate key")) return "Este item já existe.";
  if (m.includes("account_blocked")) return "Sua conta está bloqueada.";
  if (/fetch|network/i.test(m)) return "Sem conexão. Tente novamente.";
  return fallback;
}
