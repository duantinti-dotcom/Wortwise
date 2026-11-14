import type { Metadata } from "next";
import { Reports } from "./reports";

export const metadata: Metadata = { title: "Relatórios" };
export default function Page() {
  return <Reports />;
}
