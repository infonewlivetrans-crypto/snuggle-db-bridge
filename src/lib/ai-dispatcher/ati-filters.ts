// Модель фильтров ATI для AI-диспетчера.
// ВНИМАНИЕ: API ATI не используется. Это только описание фильтров,
// которые Radius Track Browser Agent выставляет/читает на реальной
// странице ATI, открытой в браузере диспетчера.

export type AtiBodyType =
  | "tent" | "refrigerator" | "isotherm" | "board" | "van" | "other";

export type AtiLoadingType =
  | "top" | "side" | "rear" | "full_untent" | "unspecified";

export type AtiPaymentType =
  | "prepay" | "no_rate" | "cash" | "cashless_vat" | "cashless_no_vat" | "with_rate";

export type AtiPickupDateMode = "today" | "tomorrow" | "week" | "custom" | "any";

export interface AtiFilters {
  from_city?: string | null;
  from_radius_km?: number | null;
  to_city?: string | null;
  to_radius_km?: number | null;
  min_distance_km?: number | null;
  max_distance_km?: number | null;
  weight_from?: number | null;
  weight_to?: number | null;
  volume_from?: number | null;
  volume_to?: number | null;
  pickup_date_mode?: AtiPickupDateMode | null;
  pickup_date_from?: string | null;
  pickup_date_to?: string | null;
  body_types?: AtiBodyType[];
  cargo_names?: string[];
  loading_types?: AtiLoadingType[];
  payment_types?: AtiPaymentType[];
  min_rate_rub_per_km?: number | null;
  min_total_price?: number | null;
  extra_filters_json?: Record<string, unknown> | null;
}

export const ATI_BODY_TYPE_LABELS: Record<AtiBodyType, string> = {
  tent: "тентованный",
  refrigerator: "рефрижератор",
  isotherm: "изотерм",
  board: "борт",
  van: "фургон",
  other: "другой",
};

export const ATI_LOADING_TYPE_LABELS: Record<AtiLoadingType, string> = {
  top: "верхняя",
  side: "боковая",
  rear: "задняя",
  full_untent: "полная растентовка",
  unspecified: "не указано",
};

export const ATI_PAYMENT_TYPE_LABELS: Record<AtiPaymentType, string> = {
  prepay: "с предоплатой",
  no_rate: "без ставки",
  cash: "за наличную оплату",
  cashless_vat: "оплата б/н с НДС",
  cashless_no_vat: "оплата б/н без НДС",
  with_rate: "со ставкой",
};

export const DEFAULT_ATI_FILTERS: AtiFilters = {
  body_types: [],
  loading_types: [],
  payment_types: [],
  cargo_names: [],
  pickup_date_mode: "any",
};
