import type { Metadata } from "next";
import { ProductView } from "./view";

export const metadata: Metadata = { title: "Análise de produto" };

export default async function Page({ params }: { params: Promise<{ source: string; id: string }> }) {
  const { source, id } = await params;
  return <ProductView source={source} id={id} />;
}
