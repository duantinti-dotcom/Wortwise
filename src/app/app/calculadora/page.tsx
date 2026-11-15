import type { Metadata } from "next";
import { Simulator } from "./simulator";

export const metadata: Metadata = { title: "Calculadora de lucro" };
export default async function Page({ searchParams }: { searchParams: Promise<{ canal?: string }> }) {
  const { canal } = await searchParams;
  return <Simulator preset={typeof canal === "string" ? canal : undefined} />;
}
