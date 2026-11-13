import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkoutUrlFor, dedupeKey, verifySignature } from "@/lib/billing/heropay";

const body = JSON.stringify({ payment: { id: "8812345", value: "49.90", status: "paid" }, cart: { src: "ww_abc" }, subscription: { id: "", status: "" } });
const secret = "whsec_test";

describe("webhook HeroPay", () => {
  it("aceita assinatura HMAC SHA-256 em hexadecimal e em base64", async () => {
    const mac = createHmac("sha256", secret).update(body);
    const hex = mac.digest("hex");
    const b64 = createHmac("sha256", secret).update(body).digest("base64");
    expect(await verifySignature(body, hex, secret)).toBe(true);
    expect(await verifySignature(body, b64, secret)).toBe(true);
  });

  it("rejeita assinatura ausente, incorreta, de outro segredo ou de corpo alterado", async () => {
    const hex = createHmac("sha256", secret).update(body).digest("hex");
    expect(await verifySignature(body, null, secret)).toBe(false);
    expect(await verifySignature(body, "00".repeat(32), secret)).toBe(false);
    expect(await verifySignature(body, hex, "outro")).toBe(false);
    expect(await verifySignature(body.replace("49.90", "0.01"), hex, secret)).toBe(false);
    expect(await verifySignature(body, hex, "")).toBe(false);
  });

  it("gera chave de deduplicação estável por gatilho e pagamento", () => {
    const p = JSON.parse(body);
    expect(dedupeKey("spark_payment_confirmed", p)).toBe(dedupeKey("spark_payment_confirmed", JSON.parse(body)));
    expect(dedupeKey("spark_payment_confirmed", p)).not.toBe(dedupeKey("refunded", p));
    expect(dedupeKey("x", {})).toBe("x:-:-:-:-");
  });

  it("monta o checkout com o token do usuário em src", () => {
    const url = checkoutUrlFor("https://pay.beta.herospark.com/abc-6095?src=plan-pro", "ww_token");
    expect(new URL(url).searchParams.get("src")).toBe("ww_token");
  });
});
