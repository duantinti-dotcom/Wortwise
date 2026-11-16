import type { Metadata, Viewport } from "next";
import "./control.css";

export const metadata: Metadata = {
  title: { default: "Worthwise Control", template: "%s · Worthwise Control" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export const viewport: Viewport = { themeColor: "#05070b" };
export const dynamic = "force-dynamic";

export default function ControlRoot({ children }: { children: React.ReactNode }) {
  return <div className="ctl">{children}</div>;
}
