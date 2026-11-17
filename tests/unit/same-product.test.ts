import { describe, expect, it } from "vitest";
import { sameProduct, specs, trusted } from "@/lib/same-product";

describe("mesmo produto", () => {
  const meia6 = "Kit 6 Pares Meias Puma Algodão Cano Médio Alto Atoalhado 2 Pretas, 2 Cinzas E 2 Brancas G - 39 A 43";
  it("reprova quantidade diferente (kit 3 × kit 6)", () => {
    expect(sameProduct(meia6, "Kit 3 Pares de Meia Puma Cano Baixo Sapatilha Invisível Soquete Feminina")).toBe(false);
    expect(sameProduct(meia6, "Kit 3X Pares Meia Cano Médio Atoalhada Ref 4530 Tamanho 39 a 43 - Puma")).toBe(false);
  });
  it("aprova o mesmo produto com nome escrito diferente", () => {
    expect(sameProduct("Garrafa Térmica Quick Flip Stanley 710ml Go Bottle Branco", "Stanley Garrafa Termica Quick Flip Go Bottle 710 ml Branca Original")).toBe(true);
    expect(sameProduct("Fone Senbenbao X55 TWS Bluetooth Display Led", "Senbenbao X55 Fone de Ouvido Bluetooth TWS com Display Led")).toBe(true);
  });
  it("reprova capacidade ou modelo diferente", () => {
    expect(sameProduct("Garrafa Térmica Stanley Quick Flip 710ml", "Garrafa Térmica Stanley Quick Flip 473ml")).toBe(false);
    expect(sameProduct("Fone Senbenbao X55 TWS Bluetooth", "Fone Senbenbao X15 TWS Bluetooth")).toBe(false);
  });
  it("reprova unidade × kit", () => {
    expect(sameProduct("Garrafa Térmica Stanley Quick Flip 710ml", "Kit 2 Garrafa Térmica Stanley Quick Flip 710ml")).toBe(false);
  });
  it("lê números com unidade", () => {
    expect([...specs("Pote 640 ML kit 10 peças 5000mAh")]).toEqual(expect.arrayContaining(["640ml", "10un", "5000mah"]));
  });
  it("só vendedor confiável", () => {
    expect(trusted({ rating: 4.6, reviewsCount: 300 })).toBe(true);
    expect(trusted({ rating: 3.8, reviewsCount: 3000 })).toBe(false);
    expect(trusted({ rating: 4.9, reviewsCount: 5 })).toBe(false);
    expect(trusted({ rating: null, reviewsCount: null, soldQuantity: 500 })).toBe(true);
    expect(trusted({ rating: null, reviewsCount: null, soldQuantity: null })).toBe(false);
  });
});
