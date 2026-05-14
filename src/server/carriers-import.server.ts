import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeFullName } from "@/lib/normalize-name";

export type CarrierImportItem = {
  fullName: string;
};

export type CarrierImportResult = {
  total: number;
  uniqueCount: number;
  inserted: number;
  skipped: number;
  items: Array<{
    fullName: string;
    normalized: string;
    carrierType: "self_employed" | "ip" | "ooo";
    action: "inserted" | "skipped";
    reason?: string;
  }>;
};

function detectCarrierType(name: string): "self_employed" | "ip" | "ooo" {
  const n = name.toLowerCase();
  if (/\bооо\b/.test(n)) return "ooo";
  if (/\bип\b/.test(n) || /\sип$/.test(n)) return "ip";
  // СП/сз — самозанятый
  if (/\bсп\b/.test(n) || /\bсз\b/.test(n)) return "self_employed";
  return "self_employed";
}

export async function importCarriers(
  items: CarrierImportItem[],
): Promise<CarrierImportResult> {
  const result: CarrierImportResult = {
    total: items.length,
    uniqueCount: 0,
    inserted: 0,
    skipped: 0,
    items: [],
  };

  // Дедупликация по нормализованному имени
  const map = new Map<string, string>();
  for (const it of items) {
    const norm = normalizeFullName(it.fullName);
    if (!norm) continue;
    if (!map.has(norm)) map.set(norm, it.fullName.trim());
  }
  result.uniqueCount = map.size;

  // Существующие — по company_name (нет normalized колонки, ищем нечётко через ilike)
  const existingNorms = new Set<string>();
  const norms = Array.from(map.keys());
  if (norms.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("carriers")
      .select("company_name");
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ company_name: string }>) {
      existingNorms.add(normalizeFullName(row.company_name));
    }
  }

  const toInsert: Array<Record<string, unknown>> = [];
  for (const [norm, name] of map.entries()) {
    if (existingNorms.has(norm)) {
      result.skipped += 1;
      result.items.push({
        fullName: name,
        normalized: norm,
        carrierType: detectCarrierType(name),
        action: "skipped",
        reason: "Уже есть в справочнике",
      });
      continue;
    }
    const t = detectCarrierType(name);
    toInsert.push({
      company_name: name,
      carrier_type: t,
      verification_status: "new",
      source: "import",
    });
    result.items.push({
      fullName: name,
      normalized: norm,
      carrierType: t,
      action: "inserted",
    });
  }

  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error } = await supabaseAdmin.from("carriers").insert(chunk as never);
      if (error) throw new Error(error.message);
    }
    result.inserted = toInsert.length;
  }
  return result;
}
