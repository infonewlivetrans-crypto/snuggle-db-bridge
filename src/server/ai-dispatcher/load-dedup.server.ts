// Deduplication слой для грузов, полученных от Radius Track Browser Agent.
// API ATI не используется.

export interface AgentLoadInput {
  source_external_ref?: string | null;
  source_card_anchor?: string | null;
  source_row_index?: number | null;
  raw_text?: string | null;
  pickup_city?: string | null;
  pickup_region?: string | null;
  pickup_date?: string | null;
  delivery_city?: string | null;
  delivery_region?: string | null;
  delivery_date?: string | null;
  cargo_name?: string | null;
  weight?: number | null;
  volume?: number | null;
  pallets?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  body_type?: string | null;
  loading_type?: string | null;
  price?: number | null;
  payment_type?: string | null;
  distance_km?: number | null;
  source_url?: string | null;
  source_page_url?: string | null;
  agent_open_hint_json?: Record<string, unknown> | null;
}

export function normaliseLoadForDedup(v?: string | number | null): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .toLowerCase()
    .replace(/[₽,;]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildLoadDedupKey(input: AgentLoadInput, sourcePageUrl?: string | null): string {
  if (input.source_external_ref && String(input.source_external_ref).trim()) {
    return `ext:${normaliseLoadForDedup(input.source_external_ref)}|src:${normaliseLoadForDedup(sourcePageUrl)}`;
  }
  const parts = [
    normaliseLoadForDedup(input.pickup_city),
    normaliseLoadForDedup(input.delivery_city),
    normaliseLoadForDedup(input.pickup_date),
    normaliseLoadForDedup(input.weight),
    normaliseLoadForDedup(input.volume),
    normaliseLoadForDedup(input.price),
    normaliseLoadForDedup(input.cargo_name),
    normaliseLoadForDedup(sourcePageUrl ?? input.source_page_url ?? input.source_url),
  ];
  return `nat:${parts.join("|")}`;
}
