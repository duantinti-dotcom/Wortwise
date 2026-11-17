import "server-only";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { clientIp } from "@/lib/http";
import { serverRpcSafe } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/utils";

/** Nome do cookie aleatório que identifica o navegador (definido no middleware). */
export const DEVICE_COOKIE = "ww_did";

/**
 * Registra o cadastro para a regra "uma conta grátis por aparelho e por rede".
 * Guarda só hashes com o segredo do servidor: o IP e o identificador do aparelho nunca ficam salvos.
 */
/** Hashes (com o segredo do servidor) do IP e do aparelho de quem fez o pedido. */
export async function currentHashes(request: Request): Promise<{ ipHash: string; deviceHash: string | null }> {
  const secret = serverEnv().serverSecret;
  const ipHash = await sha256Hex(`ww-ip:${secret}:${clientIp(request)}`);
  const device = (await cookies()).get(DEVICE_COOKIE)?.value;
  const deviceHash = device && /^[0-9a-f-]{36}$/i.test(device) ? await sha256Hex(`ww-dev:${secret}:${device}`) : null;
  return { ipHash, deviceHash };
}

export async function registerSignup(request: Request, userId: string) {
  const { ipHash, deviceHash } = await currentHashes(request);
  await serverRpcSafe("server_register_signup", { p_user: userId, p_ip_hash: ipHash, p_device_hash: deviceHash });
}
