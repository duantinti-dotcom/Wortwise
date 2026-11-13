"use client";
import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Kind = "success" | "error" | "info";
interface ToastItem { id: number; kind: Kind; message: string; leaving?: boolean }

const Ctx = createContext<{ toast: (message: string, kind?: Kind) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, kind: Kind = "success") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, kind, message }]);
    setTimeout(() => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 3600);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3900);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 max-md:bottom-24">
        {items.map((t) => (
          <div key={t.id} role="status"
            className={cn("glass pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full py-2.5 pl-3.5 pr-5 text-sm animate-toast-in transition-all duration-300",
              t.leaving && "translate-y-2 opacity-0")}>
            {t.kind === "success" ? <CheckCircle2 size={17} className="shrink-0 text-pos" /> : t.kind === "error" ? <CircleAlert size={17} className="shrink-0 text-neg" /> : <Info size={17} className="shrink-0 text-brand-hi" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast fora do ToastProvider");
  return ctx.toast;
}
