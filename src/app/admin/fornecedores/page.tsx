import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { DirectoryAdmin } from "./directory";

export const metadata: Metadata = { title: "Fornecedores" };
export default function Page() {
  return (
    <>
      <PageHeader title="Diretório de fornecedores" description="Fornecedores publicados para todos os usuários. Publique apenas empresas com autorização e contatos comerciais públicos; a verificação de CNPJ consulta a Receita Federal via BrasilAPI." />
      <DirectoryAdmin />
    </>
  );
}
