/**
 * Подготовка адреса заказа для геокодера Яндекса:
 *  - чистим телефоны, маркеры оплаты, скобочные комментарии;
 *  - нормализуем сокращения (ст-ца, СНТ, ул., д., х., пос., р-н, обл.);
 *  - формируем 2–3 кандидата (исходный, +client.address, +default region).
 *
 * Запросы в Яндекс идут только через geocodeAddress(sb, ...) из
 * yandex.server.ts — а тот ходит на наш собственный серверный контур
 * (RPC-кэш + ключ, ограниченный IP VPS). Браузер не задействуется.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { geocodeAddress } from "@/server/yandex.server";

type Sb = SupabaseClient<Database>;

/** Убирает телефоны, скобки, маркеры оплаты/QR/служебный текст. */
export function cleanAddress(input: string): string {
  let s = String(input);

  // телефоны (+7..., 8-, 7-, 10+ цифр подряд с разделителями)
  s = s.replace(/(\+?\d[\d\s\-()]{8,}\d)/g, " ");

  // скобочные комментарии
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\[[^\]]*\]/g, " ");

  // маркеры оплаты/QR/прочее
  s = s.replace(
    /\b(опл(ата|\.?)|нал(ичные|\.?)?|qr|перевод|карта|предопл(ата|\.?)?|безнал|оплачен[оа]?)\b/giu,
    " ",
  );

  // лишние знаки
  s = s.replace(/[;|]+/g, ",");
  s = s.replace(/,\s*,+/g, ", ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[,.\s-]+|[,.\s-]+$/g, "");
  return s;
}

/** Нормализует сокращения: ст-ца → станица и т.п. */
export function normalizeAbbreviations(input: string): string {
  let s = " " + input + " ";
  const map: Array<[RegExp, string]> = [
    [/\bст-?ца\.?\b/giu, "станица"],
    [/\bст\.\s/giu, "станица "],
    [/\bснт\.?\b/giu, "СНТ"],
    [/\bднт\.?\b/giu, "ДНТ"],
    [/\bкп\.?\b/giu, "коттеджный посёлок"],
    [/\bул\.?\b/giu, "улица"],
    [/\bпр-?т\.?\b/giu, "проспект"],
    [/\bпер\.?\b/giu, "переулок"],
    [/\bпр-?д\.?\b/giu, "проезд"],
    [/\bш\.\b/giu, "шоссе"],
    [/\bб-р\.?\b/giu, "бульвар"],
    [/\bнаб\.?\b/giu, "набережная"],
    [/\bпл\.?\b/giu, "площадь"],
    [/\bмкр?\.?\b/giu, "микрорайон"],
    [/\bр-?н\.?\b/giu, "район"],
    [/\bобл\.?\b/giu, "область"],
    [/\bкрай\.?\b/giu, "край"],
    [/\bг\.\s/giu, "город "],
    [/\bд\.\s*(\d)/giu, "дом $1"],
    [/\bдом\.\s*(\d)/giu, "дом $1"],
    [/\bкв\.\s*(\d)/giu, "квартира $1"],
    [/\bстр\.\s*(\d)/giu, "строение $1"],
    [/\bкорп?\.\s*(\d)/giu, "корпус $1"],
    [/\bх\.\s/giu, "хутор "],
    [/\bпос\.?\s/giu, "посёлок "],
    [/\bпгт\.?\s/giu, "пгт "],
    [/\bс\.\s/giu, "село "],
    [/\bдер\.?\s/giu, "деревня "],
    [/\bкр-?й\.?\b/giu, "край"],
  ];
  for (const [re, repl] of map) s = s.replace(re, repl);
  return s.replace(/\s+/g, " ").trim();
}

/** Возвращает true, если строка уже содержит регион. */
function hasRegionHint(s: string, region: string): boolean {
  if (!region) return true;
  const norm = s.toLowerCase();
  const tokens = region
    .toLowerCase()
    .replace(/(край|область|обл\.?|респ(ублика)?\.?)/g, "")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 3);
  if (tokens.length === 0) return false;
  return tokens.some((t) => norm.includes(t));
}

/** Возвращает true, если в строке уже упомянут крупный город. */
function hasCityHint(s: string, city: string | null): boolean {
  if (!city) return true;
  const norm = s.toLowerCase();
  return city
    .toLowerCase()
    .split(/[,\s]+/)
    .filter((t) => t.length > 3)
    .some((t) => norm.includes(t));
}

/** Контекст для генерации кандидатов адреса. */
export type GeoContext = {
  clientAddress?: string | null;
  defaultRegion?: string | null;
};

/** Возвращает упорядоченный список кандидатов адреса (без дублей). */
export function buildCandidates(address: string, ctx: GeoContext): string[] {
  const base = normalizeAbbreviations(cleanAddress(address));
  if (!base) return [];

  const out: string[] = [base];

  const region = (ctx.defaultRegion ?? "").trim();
  const clientAddr = ctx.clientAddress ? cleanAddress(ctx.clientAddress) : "";
  // вытащим город из адреса клиента (первый сегмент)
  const clientCity = clientAddr
    ? (clientAddr.split(",")[0] ?? "").trim() || null
    : null;

  if (clientCity && !hasCityHint(base, clientCity)) {
    out.push(`${clientCity}, ${base}`);
  }

  if (region && !hasRegionHint(base, region)) {
    const withRegion = clientCity
      ? `${region}, ${clientCity}, ${base}`
      : `${region}, ${base}`;
    out.push(withRegion);
  }

  // dedup, max 3
  const uniq: string[] = [];
  for (const c of out) {
    if (c && !uniq.includes(c)) uniq.push(c);
    if (uniq.length >= 3) break;
  }
  return uniq;
}

export type GeocodeOutcome = {
  lat: number;
  lng: number;
  formatted_address: string | null;
  candidate: string;
};

/** Пробует кандидатов один за другим, возвращает первый успешный. */
export async function geocodeOrderRow(
  sb: Sb,
  address: string,
  ctx: GeoContext,
): Promise<GeocodeOutcome | null> {
  const candidates = buildCandidates(address, ctx);
  for (const candidate of candidates) {
    try {
      const row = await geocodeAddress(sb, candidate);
      if (
        typeof row.lat === "number" &&
        typeof row.lng === "number" &&
        Number.isFinite(row.lat) &&
        Number.isFinite(row.lng)
      ) {
        return {
          lat: row.lat,
          lng: row.lng,
          formatted_address: row.formatted_address ?? null,
          candidate,
        };
      }
    } catch (e) {
      console.warn("[order-geocode] candidate failed:", candidate, e);
    }
  }
  return null;
}
