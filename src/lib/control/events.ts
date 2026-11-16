import { serverEnv } from "@/lib/env";
import { serverRpcSafe } from "@/lib/supabase/server";
import { actorHash, requestCountry, requestIp } from "./identity";

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type EventClass = "suspicious" | "blocked" | "incident" | "info";

export interface ControlEvent {
  category?: "security" | "ops";
  kind: string;
  severity: Severity;
  class?: EventClass;
  path?: string | null;
  detail?: Record<string, unknown>;
}

/** Grava um evento de segurança/operação a partir de uma requisição (IP só como hash). Nunca lança erro. */
export async function logControlEvent(headers: Headers, e: ControlEvent): Promise<void> {
  try {
    const actor = await actorHash(serverEnv().serverSecret, requestIp(headers));
    await serverRpcSafe("server_control_event", {
      p_category: e.category ?? "security", p_kind: e.kind, p_severity: e.severity, p_class: e.class ?? "suspicious",
      p_actor: actor, p_country: requestCountry(headers), p_path: e.path ?? null, p_detail: e.detail ?? {},
    });
  } catch {
    /* melhor esforço */
  }
}
