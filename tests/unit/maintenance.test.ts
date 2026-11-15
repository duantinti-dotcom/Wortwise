import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ serverRpc: (...a: unknown[]) => rpc(...a), serverRpcSafe: vi.fn(), supabaseAnon: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));

const { archivePrices } = await import("@/lib/maintenance");

const rows = [
  { id: 1, product_id: "p1", collected_at: "2025-01-10T10:00:00Z", price: "99.90" },
  { id: 2, product_id: "p2", collected_at: "2025-01-11T10:00:00Z", price: "49.90" },
];

function bucket(corrupt = false) {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    async put(key: string, value: Uint8Array) { store.set(key, corrupt ? new Uint8Array([1, 2, 3]) : value); },
    async get(key: string) { const v = store.get(key); return v ? { size: v.byteLength, arrayBuffer: async () => v.slice().buffer } : null; },
  };
}

describe("arquivamento do histórico no R2", () => {
  beforeEach(() => { rpc.mockReset(); });

  it("grava, confere a cópia (SHA-256 e contagem) e só então confirma a remoção", async () => {
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "server_archive_candidates") return rpc.mock.calls.filter((c) => c[0] === fn).length === 1 ? rows : [];
      if (fn === "server_archive_commit") return { archived: (args.p_ids as number[]).length };
      throw new Error(fn);
    });
    const b = bucket();
    expect(await archivePrices(b)).toBe(2);
    const commit = rpc.mock.calls.find((c) => c[0] === "server_archive_commit")![1] as { p_key: string; p_sha256: string; p_ids: number[] };
    expect(commit.p_key).toBe("price-history/2025/01/2025-01-10-1-2.ndjson.gz");
    expect(commit.p_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(commit.p_ids).toEqual([1, 2]);
    // o arquivo é NDJSON gzip legível com as mesmas linhas
    const text = await new Response(new Blob([b.store.get(commit.p_key)!]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    expect(text.split("\n").map((l) => JSON.parse(l))).toEqual(rows);
  });

  it("se a cópia gravada não confere, não confirma nada (os dados continuam no banco)", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "server_archive_candidates" ? rows : { archived: 0 }));
    await expect(archivePrices(bucket(true))).rejects.toThrow(/Checksum diferente/);
    expect(rpc.mock.calls.some((c) => c[0] === "server_archive_commit")).toBe(false);
  });
});
