import type { Metadata } from "next";
import { getUsage, quotaOf } from "@/lib/auth";
import { getAiProvider } from "@/lib/ai/provider";
import { Assistant } from "./assistant";

export const metadata: Metadata = { title: "Assistente Worthwise" };

export default async function Page() {
  const usage = await getUsage();
  const q = quotaOf(usage, "ai_message");
  return <Assistant available={Boolean(getAiProvider())} remaining={q?.remaining ?? null} />;
}
