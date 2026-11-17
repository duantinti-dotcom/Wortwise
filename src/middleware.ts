import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { actorHash, requestCountry, requestIp, SCANNER_PATH } from "@/lib/control/identity";

/**
 * Renova a sessão do Supabase (cookies) e faz o primeiro bloqueio de rotas privadas.
 * A autorização definitiva acontece nos layouts/rotas do servidor e no banco (RLS).
 *
 * Worthwise Control: em CONTROL_HOST (admin.worthwise.site) todo caminho é servido por /control/*.
 * No domínio principal, /control responde 404 (o painel só existe no subdomínio).
 */
const CONTROL_PUBLIC = /^\/(?:entrar|mfa|auth\/callback|sair)(?:\/|$)/;

/** Grava um evento de segurança sem atrasar a resposta (IP só como hash). */
function securityEvent(request: NextRequest, event: NextFetchEvent, kind: string, severity: string, cls: string, path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.WW_SERVER_SECRET;
  if (!url || !key || !secret) return;
  event.waitUntil((async () => {
    try {
      await fetch(`${url}/rest/v1/rpc/server_control_event`, {
        method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ p_secret: secret, p_category: "security", p_kind: kind, p_severity: severity, p_class: cls,
          p_actor: await actorHash(secret, requestIp(request.headers)), p_country: requestCountry(request.headers), p_path: path.slice(0, 160), p_detail: {} }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* melhor esforço */ }
  })());
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const controlHost = (process.env.CONTROL_HOST ?? "").toLowerCase();
  const onControlHost = Boolean(controlHost) && host === controlHost;

  // Varredura automática (/.env, /wp-login.php…): registra e responde 404 sem tocar na aplicação.
  if (SCANNER_PATH.test(pathname)) {
    securityEvent(request, event, "scanner_probe", "medium", "blocked", pathname);
    return new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  }

  // O painel não existe fora do subdomínio administrativo (quando CONTROL_HOST está definido).
  if (!onControlHost && controlHost && (pathname === "/control" || pathname.startsWith("/control/"))) {
    securityEvent(request, event, "control_wrong_host", "low", "blocked", pathname);
    return new NextResponse("Not found", { status: 404 });
  }

  // Um só endereço (sem www): o login começa e termina no mesmo domínio, então o cookie do Google não se perde.
  // (O retorno /auth/callback não é redirecionado, para não perder o cookie de quem já começou pelo www.)
  if (host.startsWith("www.") && !pathname.startsWith("/auth/")) {
    const to = request.nextUrl.clone();
    to.host = host.slice(4);
    to.port = "";
    return NextResponse.redirect(to, 308);
  }
  // Plano B do login com Google: se o retorno cair na página inicial com o código, termina o login no lugar certo.
  if (pathname === "/" && !onControlHost) {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
      // Página inicial sempre conferida com o servidor (evita mostrar uma versão antiga sem o visual).
      const r = NextResponse.next();
      r.headers.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      return r;
    }
    const cb = new URL("/auth/callback", request.url);
    cb.searchParams.set("code", code);
    return NextResponse.redirect(cb);
  }

  // Caminho interno do painel: no subdomínio, "/financeiro" → "/control/financeiro".
  const isControl = onControlHost || pathname === "/control" || pathname.startsWith("/control/");
  const controlPath = onControlHost ? (pathname.startsWith("/control") ? pathname.slice(8) || "/" : pathname) : pathname.slice(8) || "/";
  const controlBase = onControlHost ? "" : "/control";
  if (onControlHost && pathname.startsWith("/control")) {
    // URLs limpas no subdomínio.
    const to = request.nextUrl.clone();
    to.pathname = controlPath;
    return NextResponse.redirect(to);
  }

  const isPrivate = pathname.startsWith("/app") || pathname.startsWith("/admin") || isControl;
  if (!url || !key) {
    if (isPrivate) return NextResponse.redirect(new URL(isControl ? `${controlBase}/entrar` : "/entrar?erro=configuracao", request.url));
    return NextResponse.next();
  }

  const reqHeaders = new Headers(request.headers);
  if (isControl) reqHeaders.set("x-control-base", controlBase);
  const forward = () => {
    if (!onControlHost) return NextResponse.next({ request: { headers: reqHeaders } });
    const to = request.nextUrl.clone();
    to.pathname = `/control${controlPath === "/" ? "" : controlPath}`;
    return NextResponse.rewrite(to, { request: { headers: reqHeaders } });
  };

  let response = forward();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const c of list) request.cookies.set(c.name, c.value);
        response = forward();
        for (const c of list) response.cookies.set(c.name, c.value, c.options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  // Identificador aleatório do navegador, usado só para a regra "uma conta grátis por aparelho".
  if (!isControl && !request.cookies.get("ww_did")) {
    response.cookies.set("ww_did", crypto.randomUUID(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 730 });
  }

  if (isPrivate && !data.user) {
    if (isControl) {
      if (CONTROL_PUBLIC.test(controlPath) || controlPath.startsWith("/_")) return response;
      if (!controlPath.startsWith("/api/")) securityEvent(request, event, "control_unauthenticated", "low", "blocked", controlPath);
      const login = new URL(`${controlBase}/entrar`, request.url);
      const redirect = NextResponse.redirect(login);
      for (const c of response.cookies.getAll()) redirect.cookies.set(c);
      return redirect;
    }
    if (pathname.startsWith("/admin")) securityEvent(request, event, "admin_unauthenticated", "low", "blocked", pathname);
    const login = new URL("/entrar", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(login);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  if (isControl) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "no-store");
  } else if (pathname === "/entrar" || pathname === "/cadastro") {
    response.headers.set("Cache-Control", "private, no-cache, must-revalidate");
  }
  return response;
}

export const config = {
  // Apenas rotas que dependem de sessão; páginas públicas ficam estáticas e em cache.
  // Também: o subdomínio administrativo inteiro e caminhos típicos de varredura automática.
  matcher: [
    "/", "/app/:path*", "/admin/:path*", "/control", "/control/:path*", "/api/((?!webhooks|cron|health|track).*)", "/entrar", "/cadastro", "/auth/:path*",
    { source: "/((?!_next/static|_next/image|favicon\\.ico|icon|apple-icon).*)", has: [{ type: "host", value: "admin\\..*" }] },
    "/(wp-.*|wordpress.*|\\.env.*|\\.git.*|\\.aws.*|\\.ssh.*|xmlrpc\\.php|phpmyadmin.*|pma|cgi-bin.*|vendor/phpunit.*|actuator.*|boaform.*|server-status|config\\.php|admin\\.php|administrator.*|setup\\.php|_ignition.*|telescope.*|\\.vscode.*|backup.*|db\\.sql|dump\\.sql)",
  ],
};
