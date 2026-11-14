import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <p className="mt-10 font-mono text-sm text-brand">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="mt-3 max-w-sm text-muted">O endereço pode ter mudado ou nunca ter existido.</p>
      <div className="mt-8 flex gap-3"><Link href="/" className="btn btn-primary">Ir para o início</Link><Link href="/app" className="btn btn-secondary">Abrir o app</Link></div>
    </main>
  );
}
