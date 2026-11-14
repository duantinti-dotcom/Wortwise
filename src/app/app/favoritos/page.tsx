import type { Metadata } from "next";
import { Favorites } from "./favorites";

export const metadata: Metadata = { title: "Favoritos e coleções" };
export default function Page() {
  return <Favorites />;
}
