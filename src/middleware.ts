import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase (cookies) e faz o primeiro bloqueio de rotas privadas.
 * A autorização definitiva acontece nos layouts/rotas do servidor e no banco (RLS).
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const { pathname } = request.nextUrl;
  const isPrivate = pathname.startsWith("/app") || pathname.startsWith("/admin");

  if (!url || !key) {
    if (isPrivate) return NextResponse.redirect(new URL("/entrar?erro=configuracao", request.url));
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const c of list) request.cookies.set(c.name, c.value);
        response = NextResponse.next({ request });
        for (const c of list) response.cookies.set(c.name, c.value, c.options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  if (isPrivate && !data.user) {
    const login = new URL("/entrar", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(login);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}

export const config = {
  // Apenas rotas que dependem de sessão; páginas públicas ficam estáticas e em cache.
  matcher: ["/app/:path*", "/admin/:path*", "/api/((?!webhooks|cron|health).*)", "/entrar", "/cadastro", "/auth/:path*"],
};
