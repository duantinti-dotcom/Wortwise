import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { ShowcaseAdmin } from "./showcase";

export const metadata: Metadata = { title: "Vitrine" };
export default function Page() {
  return (
    <>
      <PageHeader title="Vitrine de produtos" description="Cole o link de um produto que está vendendo bem. O site tenta preencher nome, foto e preço sozinho; confira e salve. Cada vez que você atualizar o preço, o gráfico registra." />
      <ShowcaseAdmin />
    </>
  );
}
