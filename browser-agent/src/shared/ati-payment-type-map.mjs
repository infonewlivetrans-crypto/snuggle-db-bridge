// Карта форм оплаты ATI.
export const ATI_PAYMENT_TYPE_MAP = {
  cash: ["наличные", "нал"],
  cashless_no_vat: ["безнал без ндс", "б/н без ндс"],
  cashless_with_vat: ["безнал с ндс", "б/н с ндс"],
  prepayment: ["с предоплатой", "предоплата"],
  no_rate: ["без ставки"],
  min_rate: ["минимальная ставка"],
  min_rate_per_km: ["минимальная ставка за километр", "мин. ставка за км"],
};

export function matchAtiPaymentType(labelText) {
  const t = String(labelText || "").trim().toLowerCase();
  if (!t) return null;
  // Более длинные/специфичные алиасы должны иметь приоритет,
  // чтобы «безнал с НДС» не поймалось на алиас «нал».
  const flat = [];
  for (const [key, aliases] of Object.entries(ATI_PAYMENT_TYPE_MAP)) {
    for (const a of aliases) flat.push({ key, alias: a });
  }
  flat.sort((a, b) => b.alias.length - a.alias.length);
  for (const { key, alias } of flat) {
    if (t === alias || t.includes(alias)) return key;
  }
  return null;
}
