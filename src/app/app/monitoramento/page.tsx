import type { Metadata } from "next";
import { Monitoring } from "./monitoring";

export const metadata: Metadata = { title: "Monitoramento" };
export default function Page() {
  return <Monitoring />;
}
