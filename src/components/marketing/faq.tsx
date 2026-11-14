"use client";
import { Plus } from "lucide-react";
import { Accordion as A } from "radix-ui";
import { FAQ_ITEMS } from "@/lib/faq";

export function Faq() {
  return (
    <A.Root type="single" collapsible className="divide-y divide-white/10">
      {FAQ_ITEMS.map((item, i) => (
        <A.Item key={item.q} value={`i${i}`}>
          <A.Header>
            <A.Trigger className="group flex w-full items-center justify-between gap-6 py-5 text-left text-base font-medium transition-colors hover:text-brand-hi">
              {item.q}
              <Plus size={18} className="shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-45" />
            </A.Trigger>
          </A.Header>
          <A.Content className="overflow-hidden text-[15px] leading-relaxed text-muted data-[state=closed]:animate-[acc-up_0.2s_ease-in] data-[state=open]:animate-[acc-down_0.26s_cubic-bezier(0.16,1,0.3,1)]">
            <p className="max-w-3xl pb-6">{item.a}</p>
          </A.Content>
        </A.Item>
      ))}
    </A.Root>
  );
}
