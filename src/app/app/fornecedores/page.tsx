import type { Metadata } from "next";
import { Suppliers } from "./suppliers";

export const metadata: Metadata = { title: "Fornecedores" };
export default function Page() {
  return <Suppliers />;
}
