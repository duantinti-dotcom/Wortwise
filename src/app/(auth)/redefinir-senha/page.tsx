import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense><AuthForm mode="reset" /></Suspense>;
}
