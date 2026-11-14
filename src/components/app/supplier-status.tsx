import { BadgeCheck, CircleDashed, CircleHelp, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export const VERIFICATION: Record<string, { label: string; cls: string; icon: typeof BadgeCheck; help: string }> = {
  doc_verified: { label: "Verificação documental realizada", cls: "badge-pos", icon: BadgeCheck, help: "CNPJ consultado na base pública da Receita Federal e com situação cadastral ativa. Não avalia qualidade do produto nem do atendimento." },
  source_reputation: { label: "Reputação disponível na fonte", cls: "badge-brand", icon: Star, help: "A fonte de origem informa avaliações verificáveis deste fornecedor." },
  insufficient: { label: "Informações insuficientes", cls: "badge-neg", icon: CircleHelp, help: "A consulta cadastral não confirmou um CNPJ ativo." },
  unverified: { label: "Fornecedor ainda não verificado", cls: "", icon: CircleDashed, help: "Nenhum procedimento de verificação foi realizado." },
};

export function VerificationBadge({ status }: { status: string }) {
  const v = VERIFICATION[status] ?? VERIFICATION.unverified!;
  return <span className={cn("badge", v.cls)} title={v.help}><v.icon size={12} />{v.label}</span>;
}
