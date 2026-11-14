import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { isGoogleEnabled } from "@/lib/auth-providers";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default async function Page() {
  const google = await isGoogleEnabled();
  return <Suspense><AuthForm mode="login" google={google} /></Suspense>;
}
