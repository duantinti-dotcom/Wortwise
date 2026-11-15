import type { Metadata } from "next";
import { getUsage, quotaOf } from "@/lib/auth";
import { getAiProvider } from "@/lib/ai/provider";
import { Assistant } from "./assistant";

export const metadata: Metadata = { title: "Assistente" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q: question }, usage] = await Promise.all([searchParams, getUsage()]);
  const q = quotaOf(usage, "ai_message");
  return <Assistant available={Boolean(getAiProvider())} remaining={q?.remaining ?? null} initialQuestion={typeof question === "string" ? question : undefined} />;
}
