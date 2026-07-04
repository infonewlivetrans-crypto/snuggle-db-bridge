// Разбор произвольного текста карточки груза ATI.
// Никаких запросов к API ATI. Только текст, который уже видит пользователь.

export interface ParsedLoadFields {
  pickup_city?: string;
  delivery_city?: string;
  pickup_date?: string;
  delivery_date?: string;
  cargo_name?: string;
  weight?: number;
  volume?: number;
  body_type?: string;
  loading_type?: string;
  price?: number;
  payment_type?: string;
  distance_km?: number;
  price_per_km?: number;
}

const CITY_ARROW = /([А-ЯЁ][а-яё\-]+(?:\s+[А-ЯЁ][а-яё\-]+)?)\s*[—–\->]{1,2}\s*([А-ЯЁ][а-яё\-]+(?:\s+[А-ЯЁ][а-яё\-]+)?)/;
const WEIGHT_RE = /(\d+(?:[.,]\d+)?)\s*т(?:онн)?\b/i;
const VOLUME_RE = /(\d+(?:[.,]\d+)?)\s*м[3³]/i;
const PRICE_RE = /(\d[\d\s]{2,})\s*(?:₽|руб|р\.?)/i;
const PPKM_RE = /(\d[\d\s.,]*)\s*(?:₽|руб|р\.?)\s*\/\s*км/i;
const DIST_RE = /(\d[\d\s]{1,})\s*км\b/i;
const DATE_RE = /\b(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\b/;
const BODY_TYPES = ["тент","реф","изотерм","борт","цельномет","фургон","контейнер","автовоз"];
const LOAD_TYPES = ["задняя","боковая","верхняя","полная","растентовка","гидроборт"];
const PAY_TYPES = ["нал","безнал","карта","аванс","отсрочка","предоплата","на выгрузке"];

function num(s: string | undefined | null): number | undefined {
  if (!s) return undefined;
  const n = Number(String(s).replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function parseLoadText(raw: string): ParsedLoadFields {
  const text = (raw || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return {};
  const out: ParsedLoadFields = {};

  const route = text.match(CITY_ARROW);
  if (route) { out.pickup_city = route[1]; out.delivery_city = route[2]; }

  const w = text.match(WEIGHT_RE); if (w) out.weight = num(w[1]);
  const v = text.match(VOLUME_RE); if (v) out.volume = num(v[1]);
  const ppkm = text.match(PPKM_RE); if (ppkm) out.price_per_km = num(ppkm[1]);
  const price = text.match(PRICE_RE); if (price) out.price = num(price[1]);
  const dist = text.match(DIST_RE); if (dist) out.distance_km = num(dist[1]);
  const date = text.match(DATE_RE); if (date) out.pickup_date = date[1];

  const low = text.toLowerCase();
  for (const b of BODY_TYPES) if (low.includes(b)) { out.body_type = b; break; }
  for (const l of LOAD_TYPES) if (low.includes(l)) { out.loading_type = l; break; }
  for (const p of PAY_TYPES) if (low.includes(p)) { out.payment_type = p; break; }

  return out;
}

export function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}
