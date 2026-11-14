import type { Metadata } from "next";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Boas-vindas" };
export default function Page() {
  return <Onboarding />;
}
