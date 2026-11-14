import type { ScoreResult } from "@/lib/score/score";
import { cn } from "@/lib/utils";

export function ScoreRing({ value, size = 92, label }: { value: number | null; size?: number; label?: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const color = value == null ? "#444" : value >= 70 ? "#3ecf8e" : value >= 45 ? "#ff7900" : "#f25f5c";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={value == null ? "Score indisponível" : `Score ${value} de 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1), stroke 0.3s" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("tabular font-semibold leading-none tracking-tight", size < 80 ? "text-lg" : size > 110 ? "text-4xl" : "text-2xl")}>{value ?? "—"}</span>
        {size >= 80 ? <span className="mt-1 text-[10px] uppercase tracking-wider text-faint">{label ?? "de 100"}</span> : null}
      </div>
    </div>
  );
}

/** Explicação transparente do Score: cada fator, seu peso, sua nota e de onde veio o dado. */
export function ScoreBreakdown({ result }: { result: ScoreResult }) {
  return (
    <div className="space-y-3">
      {result.factors.map((f) => (
        <div key={f.id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">{f.label} <span className="font-normal text-faint">· peso {Math.round(f.weight * 100)}%</span></span>
            <span className={cn("tabular", f.score == null ? "text-faint" : "text-fg")}>{f.score == null ? "sem dado" : Math.round(f.score)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/6">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${f.score ?? 0}%`, opacity: f.score == null ? 0 : 1 }} />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {f.detail} {f.nature === "indirect" ? <span className="text-faint">(indicador indireto)</span> : f.nature === "user" ? <span className="text-faint">(informado por você)</span> : null}
          </p>
        </div>
      ))}
      <p className="border-t border-line pt-3 text-xs leading-relaxed text-faint">
        O Score resume os fatores disponíveis ponderados pelo peso; fatores sem dado são excluídos e reduzem o grau de confiança
        (cobertura atual: {Math.round(result.coverage * 100)}%). Não é garantia de vendas nem de lucro.
      </p>
    </div>
  );
}
