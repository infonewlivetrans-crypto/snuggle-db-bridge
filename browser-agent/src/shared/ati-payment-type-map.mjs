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
  for (const [key, aliases] of Object.entries(ATI_PAYMENT_TYPE_MAP)) {
    if (aliases.some((a) => t === a || t.includes(a))) return key;
  }
  return null;
}
