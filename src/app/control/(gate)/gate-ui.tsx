"use client";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { enrollAction, loginAction, verifyAction, type GateState } from "./actions";

export function GateFrame({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex items-center gap-2.5">
          <LogoMark size={28} />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">Worthwise</div>
            <div className="c-faint text-[11px] font-medium tracking-[0.05em]">CONTROL</div>
          </div>
        </div>
        <div className="c-card p-6">
          <h1 className="c-h1 text-[20px]">{title}</h1>
          <p className="c-muted mt-1.5 text-[13px] leading-relaxed">{subtitle}</p>
          <div className="mt-5">{children}</div>
        </div>
        <p className="c-faint mt-5 text-center text-[11.5px] leading-relaxed">Acesso restrito à administração do Worthwise. Tentativas são registradas.</p>
      </div>
    </main>
  );
}

function ErrorLine({ msg }: { msg?: string }) {
  return msg ? <p role="alert" className="c-badge c-badge-crit h-auto w-full whitespace-normal py-1.5 text-[12.5px]">{msg}</p> : null;
}

export function LoginForm({ initialError, googleHref }: { initialError?: string; googleHref: string }) {
  const [state, action, pending] = useActionState<GateState, FormData>(loginAction, { error: initialError });
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-[12.5px]">
          <span className="c-muted">E-mail ou usuário</span>
          <input name="login" className="c-input h-10" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px]">
          <span className="c-muted">Senha</span>
          <input name="password" type="password" className="c-input h-10" autoComplete="current-password" required minLength={6} />
        </label>
        <ErrorLine msg={state.error} />
        <button type="submit" className="c-btn c-btn-primary mt-1 h-10" disabled={pending}>
          {pending ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}Continuar
        </button>
      </form>
      <div className="c-faint flex items-center gap-3 text-[11.5px]"><span className="h-px flex-1" style={{ background: "var(--c-line)" }} />ou<span className="h-px flex-1" style={{ background: "var(--c-line)" }} /></div>
      <a href={googleHref} className="c-btn h-10">Entrar com Google</a>
    </div>
  );
}

export function MfaForm({ factorId: initialFactor, reauth }: { factorId: string | null; reauth: boolean }) {
  const [enroll, setEnroll] = useState<GateState | null>(null);
  const [starting, start] = useTransition();
  const factorId = initialFactor ?? enroll?.factorId ?? null;
  const [state, action, pending] = useActionState<GateState, FormData>(verifyAction, {});

  if (!factorId) {
    return (
      <div className="flex flex-col gap-3">
        <p className="c-soft text-[13px] leading-relaxed">A verificação em duas etapas é obrigatória. Cadastre um aplicativo autenticador (Google Authenticator, 1Password, Authy…).</p>
        <ErrorLine msg={enroll?.error} />
        <button type="button" className="c-btn c-btn-primary h-10" disabled={starting} onClick={() => start(async () => setEnroll(await enrollAction()))}>
          {starting ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}Cadastrar autenticador
        </button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      {enroll?.qr && (
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-xl bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR code em data URI gerado pelo Supabase */}
            <img src={enroll.qr} alt="QR code para o aplicativo autenticador" width={168} height={168} />
          </div>
          <p className="c-muted text-center text-[12px]">Escaneie no aplicativo ou digite a chave:</p>
          <code className="c-mono c-inset break-all px-2 py-1.5 text-center">{enroll.secret}</code>
        </div>
      )}
      {reauth && !enroll?.qr && <p className="c-soft text-[13px]">Por segurança, confirme o código novamente (sessões com MFA valem 12 horas).</p>}
      <input type="hidden" name="factorId" value={factorId} />
      <label className="flex flex-col gap-1.5 text-[12.5px]">
        <span className="c-muted">Código de 6 dígitos</span>
        <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" className="c-input c-num h-11 text-center text-[20px] tracking-[0.4em]" required autoFocus />
      </label>
      <ErrorLine msg={state.error} />
      <button type="submit" className="c-btn c-btn-primary h-10" disabled={pending}>
        {pending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}Verificar
      </button>
    </form>
  );
}
