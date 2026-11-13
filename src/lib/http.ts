import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export type ApiErrorCode =
  | "unauthenticated" | "forbidden" | "invalid_input" | "quota_exceeded" | "rate_limited"
  | "not_configured" | "source_unavailable" | "not_found" | "timeout" | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401, forbidden: 403, invalid_input: 400, quota_exceeded: 402, rate_limited: 429,
  not_configured: 503, source_unavailable: 502, not_found: 404, timeout: 504, internal: 500,
};

export function apiError(code: ApiErrorCode, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status: STATUS[code] });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T | null> {
  try {
    const parsed = schema.safeParse(await req.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Protege rotas mutáveis contra CSRF: a origem precisa ser a própria aplicação. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === new URL(req.url).host || new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}
