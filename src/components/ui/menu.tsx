"use client";
import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Portal>
      <M.Content
        align={align} sideOffset={8} collisionPadding={12}
        className={cn("glass z-50 min-w-52 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-xl p-1.5",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out", className)}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, onSelect, danger, asChild }: { children: ReactNode; onSelect?: () => void; danger?: boolean; asChild?: boolean }) {
  return (
    <M.Item
      asChild={asChild} onSelect={onSelect}
      className={cn("flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors",
        "data-[highlighted]:bg-white/8", danger ? "text-[#ff8a87]" : "text-fg")}
    >
      {children}
    </M.Item>
  );
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-white/8" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <M.Label className="px-2.5 py-1.5 text-xs text-faint">{children}</M.Label>;
