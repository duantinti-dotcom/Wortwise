"use client";
import { CircleAlert, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { publicEnv } from "@/lib/env";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "recover" | "reset";

const ERRORS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  "User already registered": "Já existe uma conta com este e-mail. Tente entrar.",
  "Email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "captcha verification process failed": "Não foi possível validar a verificação de segurança. Tente novamente.",
};
const QUERY_ERRORS: Record<string, string> = {
  oauth: "Não foi possível concluir o login. Tente novamente.",
  link: "Este link expirou ou já foi usado. Solicite um novo.",
  configuracao: "A autenticação ainda não está configurada neste ambiente.",
};
const translate = (msg: string) => ERRORS[msg] ?? (/password/i.test(msg) ? "A senha precisa ter pelo menos 8 caracteres." : /network|fetch/i.test(msg) ? "Sem conexão com o servidor. Verifique sua internet e tente novamente." : "Não foi possível concluir. Tente novamente.");

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void } }
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next");
  const plan = params.get("plano");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : plan ? `/app/configuracoes?assinar=${plan}` : "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"form" | "google" | null>(null);
  const [error, setError] = useState<string | null>(QUERY_ERRORS[params.get("erro") ?? ""] ?? null);
  const [sent, setSent] = useState(false);
  const [captcha, setCaptcha] = useState<string | undefined>();
  const tsRef = useRef<HTMLDivElement>(null);
  const tsLoaded = useRef(false);
  const needsCaptcha = Boolean(publicEnv.turnstileSiteKey) && mode !== "reset";
  const configured = Boolean(publicEnv.supabaseUrl);

  const mountTurnstile = () => {
    if (!needsCaptcha || tsLoaded.current || !tsRef.current || !window.turnstile) return;
    tsLoaded.current = true;
    window.turnstile.render(tsRef.current, { sitekey: publicEnv.turnstileSiteKey, theme: "dark", callback: (t: string) => setCaptcha(t), "expired-callback": () => setCaptcha(undefined) });
  };
  useEffect(mountTurnstile);

  async function google() {
    setBusy("google");
    setError(null);
    const { error: e } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (e) { setError(translate(e.message)); setBusy(null); }
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy("form");
    setError(null);
    const supabase = supabaseBrowser();
    const origin = window.location.origin;
    try {
      if (mode === "login") {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captcha } });
        if (e) throw e;
        router.replace(next);
        router.refresh();
        return;
      }
      if (mode === "signup") {
        const { data, error: e } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name.trim() || undefined }, captchaToken: captcha, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(plan ? next : "/app/boas-vindas")}` },
        });
        if (e) throw e;
        if (data.session) { router.replace(plan ? next : "/app/boas-vindas"); router.refresh(); return; }
        setSent(true);
      }
      if (mode === "recover") {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/redefinir-senha`, captchaToken: captcha });
        if (e) throw e;
        setSent(true);
      }
      if (mode === "reset") {
        const { error: e } = await supabase.auth.updateUser({ password });
        if (e) throw e;
        router.replace("/app");
        router.refresh();
        return;
      }
    } catch (e) {
      setError(translate((e as Error).message ?? ""));
      window.turnstile?.reset();
      setCaptcha(undefined);
    }
    setBusy(null);
  }

  const copy = {
    login: { title: "Entrar no Worthwise", sub: "Continue de onde parou.", cta: "Entrar" },
    signup: { title: "Crie sua conta", sub: "Três pesquisas gratuitas, sem cartão.", cta: "Criar conta" },
    recover: { title: "Recuperar acesso", sub: "Enviaremos um link para você criar uma nova senha.", cta: "Enviar link" },
    reset: { title: "Nova senha", sub: "Escolha uma senha com pelo menos 8 caracteres.", cta: "Salvar senha" },
  }[mode];

  if (sent) {
    return (
      <div className="animate-fade-up text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10 text-brand-hi"><MailCheck size={26} /></div>
        <h1 className="mt-6 text-2xl font-semibold">Verifique seu e-mail</h1>
        <p className="mt-3 text-muted">{mode === "signup" ? "Enviamos um link de confirmação para" : "Se existir uma conta, enviamos um link de recuperação para"} <span className="text-fg">{email}</span>.</p>
        <Link href="/entrar" className="btn btn-secondary mt-8">Voltar para o login</Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {needsCaptcha ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={mountTurnstile} /> : null}
      <h1 className="text-[28px] font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-2 text-muted">{copy.sub}</p>

      {!configured ? <div role="alert" className="mt-6 rounded-xl border border-neg/30 bg-neg/8 px-4 py-3 text-sm text-[#ffb3b1]">A autenticação ainda não está configurada neste ambiente.</div> : null}

      {mode === "login" || mode === "signup" ? (
        <>
          <button type="button" onClick={google} disabled={Boolean(busy) || !configured} className="btn btn-secondary btn-lg mt-8 w-full">
            {busy === "google" ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />} Continuar com Google
          </button>
          <div className="my-6 flex items-center gap-4 text-xs text-faint"><span className="h-px flex-1 bg-line" />ou com e-mail<span className="h-px flex-1 bg-line" /></div>
        </>
      ) : <div className="mt-8" />}

      <form onSubmit={submit} className="space-y-4" noValidate={false}>
        {mode === "signup" ? (
          <label className="block"><span className="label">Nome</span>
            <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Como podemos te chamar?" /></label>
        ) : null}
        {mode !== "reset" ? (
          <label className="block"><span className="label">E-mail</span>
            <input className="input" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" /></label>
        ) : null}
        {mode !== "recover" ? (
          <label className="block">
            <span className="label flex justify-between">Senha {mode === "login" ? <Link href="/recuperar-senha" className="font-normal text-brand-hi hover:underline">Esqueci minha senha</Link> : null}</span>
            <input className="input" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "login" ? "Sua senha" : "Mínimo de 8 caracteres"} />
          </label>
        ) : null}
        {needsCaptcha ? <div ref={tsRef} className="min-h-[65px]" /> : null}
        {error ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-neg/30 bg-neg/8 px-3.5 py-3 text-sm text-[#ffb3b1]"><CircleAlert size={16} className="mt-0.5 shrink-0" />{error}</div> : null}
        <button type="submit" disabled={Boolean(busy) || !configured || (needsCaptcha && !captcha)} className="btn btn-primary btn-lg w-full">
          {busy === "form" ? <Loader2 size={18} className="animate-spin" /> : null}{copy.cta}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-muted">
        {mode === "login" ? <>Ainda não tem conta? <Link href={`/cadastro${plan ? `?plano=${plan}` : ""}`} className="text-brand-hi hover:underline">Criar conta grátis</Link></> : null}
        {mode === "signup" ? <>Já tem conta? <Link href="/entrar" className="text-brand-hi hover:underline">Entrar</Link></> : null}
        {mode === "recover" ? <Link href="/entrar" className="text-brand-hi hover:underline">Voltar para o login</Link> : null}
      </p>
      {mode === "signup" ? (
        <p className="mt-5 text-center text-xs leading-relaxed text-faint">Ao criar a conta você concorda com os <Link href="/termos" className="underline">Termos de uso</Link> e a <Link href="/privacidade" className="underline">Política de privacidade</Link>.
          Para proteger o teste gratuito contra abuso, registramos um identificador derivado do seu IP por até 90 dias.</p>
      ) : null}
    </div>
  );
}
