/** "Oi", "boa noite", "obrigado"… sem pergunta junto. */
export function isSmallTalk(text: string): boolean {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > 40) return false;
  return /^(oi+|ola|opa|e ai|eai|hey|bom dia|boa tarde|boa noite|tudo bem|tudo bom|como vai|obrigad[oa]|valeu|vlw|brigad[oa]|ok|beleza|blz|tchau|ate mais)( (tudo bem|tudo bom|wise|assistente|obrigad[oa]|valeu|ok|beleza|como vai|e voce))*( ?)$/.test(t);
}
