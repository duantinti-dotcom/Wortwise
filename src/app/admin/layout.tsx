import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ToastProvider } from "@/components/ui/toast";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./nav";

export const metadata: Metadata = { title: { default: "Administração", template: "%s · Admin Worthwise" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin(); // checagem no servidor + banco (user_roles); as políticas RLS repetem a regra
  return (
    <ToastProvider>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-4 lg:px-8">
            <Link href="/admin" aria-label="Administração"><Logo size={24} /></Link>
            <span className="badge badge-brand">Admin</span>
            <span className="ml-auto hidden text-xs text-faint sm:block">{admin.email}</span>
            <Link href="/app" className="btn btn-secondary btn-sm">Voltar ao app</Link>
          </div>
          <AdminNav />
        </header>
        <main className="mx-auto max-w-[1280px] px-4 py-8 lg:px-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
