import type { Metadata } from "next";
import { Suspense } from "react";
import { Compare } from "./compare";

export const metadata: Metadata = { title: "Comparar fornecedores" };
export default function Page() {
  return <Suspense><Compare /></Suspense>;
}
