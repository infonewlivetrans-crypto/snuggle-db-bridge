// Клиентские хелперы для dedup. Совместимы с серверной логикой в src/server/ai-dispatcher/load-dedup.server.ts.
// Не заменяют серверный dedup — используются только для локальной группировки и тестов.
import { hashText } from "./parseLoadText";

export interface DedupInput {
  source_external_ref?: string | null;
  pickup_city?: string | null;
  delivery_city?: string | null;
  pickup_date?: string | null;
  weight?: number | null;
  price?: number | null;
  raw_text?: string | null;
}

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normaliseLoadForDedup(l: DedupInput): Record<string, string | number> {
  return {
    ref: String(l.source_external_ref ?? "").trim(),
    from: norm(l.pickup_city),
    to: norm(l.delivery_city),
    date: String(l.pickup_date ?? "").trim(),
    weight: Number(l.weight ?? 0) || 0,
    price: Number(l.price ?? 0) || 0,
  };
}

export function buildLoadDedupKey(l: DedupInput): string {
  const n = normaliseLoadForDedup(l);
  if (n.ref) return `ref:${n.ref}`;
  const natural = `${n.from}|${n.to}|${n.date}|${n.weight}|${n.price}`;
  if (natural.replace(/\|/g, "").trim().length > 0) return `nat:${natural}`;
  return `hash:${hashText(String(l.raw_text ?? "").slice(0, 300))}`;
}
