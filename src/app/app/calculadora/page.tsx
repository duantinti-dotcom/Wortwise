import type { Metadata } from "next";
import { Simulator } from "./simulator";

export const metadata: Metadata = { title: "Calculadora de lucro" };
export default function Page() {
  return <Simulator />;
}
