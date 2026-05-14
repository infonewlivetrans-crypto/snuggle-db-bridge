import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeFullName } from "@/lib/normalize-name";
import { normalizeRuPhone } from "@/lib/phone";

export type DriverImportItem = {
  fullName: string;
  phone?: string | null;
  comment?: string | null;
  licenseNumber?: string | null;
};

export type DriverImportResult = {
  total: number;
  uniqueCount: number;
  inserted: number;
  updated: number;
  skipped: number;
  items: Array<{
    fullName: string;
    phone: string | null;
    action: "inserted" | "updated" | "skipped";
    reason?: string;
    driverId?: string;
  }>;
};

const DEFAULT_CARRIER_NAME = "Без перевозчика";

async function ensureDefaultCarrierId(): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("carriers")
    .select("id")
    .eq("company_name", DEFAULT_CARRIER_NAME)
    .maybeSingle();
  if (existing?.id) return (existing as { id: string }).id;
  const { data, error } = await supabaseAdmin
    .from("carriers")
    .insert({
      company_name: DEFAULT_CARRIER_NAME,
      carrier_type: "self_employed",
      verification_status: "new",
      source: "system",
    } as never)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось создать перевозчика по умолчанию");
  return (data as { id: string }).id;
}

export async function importDrivers(items: DriverImportItem[]): Promise<{
  result: DriverImportResult;
  newDrivers: Array<{ id: string; fullName: string; phone: string | null }>;
}> {
  const result: DriverImportResult = {
    total: items.length,
    uniqueCount: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    items: [],
  };
  const newDrivers: Array<{ id: string; fullName: string; phone: string | null }> = [];

  // Дедупликация по нормализованному ФИО
  const map = new Map<string, DriverImportItem>();
  for (const it of items) {
    const norm = normalizeFullName(it.fullName);
    if (!norm) {
      result.skipped += 1;
      result.items.push({
        fullName: it.fullName,
        phone: null,
        action: "skipped",
        reason: "Пустое ФИО",
      });
      continue;
    }
    if (!map.has(norm)) map.set(norm, { ...it, fullName: it.fullName.trim() });
  }
  result.uniqueCount = map.size;

  // Существующие — выбираем всех водителей и сравниваем по нормализованному ФИО
  const { data: allDrivers, error: listErr } = await supabaseAdmin
    .from("drivers")
    .select("id, full_name, phone");
  if (listErr) throw new Error(listErr.message);
  const existingByNorm = new Map<string, { id: string; full_name: string; phone: string | null }>();
  for (const d of (allDrivers ?? []) as Array<{ id: string; full_name: string; phone: string | null }>) {
    existingByNorm.set(normalizeFullName(d.full_name), d);
  }

  const carrierId = await ensureDefaultCarrierId();
  const toInsert: Array<Record<string, unknown>> = [];
  const insertOrder: Array<{ fullName: string; phone: string | null }> = [];

  for (const [norm, it] of map.entries()) {
    const phone = normalizeRuPhone(it.phone ?? null);
    const existing = existingByNorm.get(norm);
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (!existing.phone && phone) patch.phone = phone;
      if (it.comment) patch.comment = it.comment;
      if (it.licenseNumber) patch.license_number = it.licenseNumber;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabaseAdmin
          .from("drivers")
          .update(patch as never)
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        result.updated += 1;
        result.items.push({ fullName: it.fullName, phone, action: "updated", driverId: existing.id });
      } else {
        result.skipped += 1;
        result.items.push({
          fullName: it.fullName,
          phone,
          action: "skipped",
          reason: "Уже есть в справочнике",
        });
      }
      continue;
    }
    toInsert.push({
      full_name: it.fullName,
      carrier_id: carrierId,
      phone,
      comment: it.comment ?? null,
      license_number: it.licenseNumber ?? null,
      is_active: true,
      source: "import",
    });
    insertOrder.push({ fullName: it.fullName, phone });
  }

  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const orderChunk = insertOrder.slice(i, i + 200);
      const { data: ins, error } = await supabaseAdmin
        .from("drivers")
        .insert(chunk as never)
        .select("id, full_name, phone");
      if (error) throw new Error(error.message);
      for (const row of (ins ?? []) as Array<{ id: string; full_name: string; phone: string | null }>) {
        newDrivers.push({ id: row.id, fullName: row.full_name, phone: row.phone });
      }
      // если по какой-то причине select не вернул, всё равно зафиксируем результат
      for (const r of orderChunk) {
        result.items.push({
          fullName: r.fullName,
          phone: r.phone,
          action: "inserted",
        });
      }
    }
    result.inserted = toInsert.length;
  }

  return { result, newDrivers };
}
