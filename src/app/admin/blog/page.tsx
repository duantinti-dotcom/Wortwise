import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { BlogAdmin } from "./blog-admin";

export const metadata: Metadata = { title: "Blog" };
export default function Page() {
  return (
    <>
      <PageHeader title="Blog" description="Conteúdo educacional publicado por administradores. Escreva para pessoas: guias úteis, sem números inventados e sem dados de marketplaces cujo uso público não seja permitido." />
      <BlogAdmin />
    </>
  );
}
