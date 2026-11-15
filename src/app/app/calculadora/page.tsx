import type { Metadata } from "next";
import { Simulator } from "./simulator";

export const metadata: Metadata = { title: "Calculadora de lucro" };
export default async function Page({ searchParams }: { searchParams: Promise<{ canal?: string; preco?: string }> }) {
  const { canal, preco } = await searchParams;
  const price = Number(preco);
  return <Simulator preset={typeof canal === "string" ? canal : undefined} salePrice={Number.isFinite(price) && price > 0 && price < 1e6 ? price : undefined} />;
}
