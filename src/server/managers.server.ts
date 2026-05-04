import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeFullName } from "@/lib/normalize-name";
import { normalizeRuPhone } from "@/lib/phone";

export type ManagerRow = {
  id: string;
  full_name: string;
  normalized_name: string;
  phone: string | null;
  comment: string | null;
  is_active: boolean;
  status: "active" | "needs_review" | "disabled";
  source: string;
  external_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ManagerImportItem = {
  fullName: string;
  phone?: string | null;
  comment?: string | null;
  isActive?: boolean;
};

export type ManagerImportResult = {
  total: number;
  uniqueCount: number;
  inserted: number;
  updated: number;
  skipped: number;
  items: Array<{
    fullName: string;
    normalized: string;
    phone: string | null;
    action: "inserted" | "updated" | "skipped";
    reason?: string;
  }>;
};

export async function listManagers(): Promise<ManagerRow[]> {
  const { data, error } = await supabaseAdmin
    .from("managers")
    .select("*")
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ManagerRow[];
}

export async function findManagerByName(
  fullName: string,
  phone?: string | null,
): Promise<ManagerRow | null> {
  const norm = normalizeFullName(fullName);
  if (!norm) return null;
  const { data, error } = await supabaseAdmin
    .from("managers")
    .select("*")
    .eq("normalized_name", norm)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  // Если телефон передан и в справочнике задан — сравним нормализованные
  if (phone && (data as ManagerRow).phone) {
    const a = normalizeRuPhone(phone);
    const b = normalizeRuPhone((data as ManagerRow).phone);
    if (a && b && a !== b) {
      // Совпало ФИО, но телефон отличается — всё равно возвращаем (доп. подтверждение,
      // не блокирующее), вызывающая сторона может пометить запись как «нужна проверка».
    }
  }
  return data as ManagerRow;
}

/** Импорт: дедуплицирует и upsert-ит. Не сбрасывает существующие телефоны/комментарии. */
export async function importManagers(
  items: ManagerImportItem[],
  createdBy: string | null,
): Promise<ManagerImportResult> {
  const result: ManagerImportResult = {
    total: items.length,
    uniqueCount: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    items: [],
  };

  // Дедупликация
  const map = new Map<string, ManagerImportItem>();
  for (const it of items) {
    const norm = normalizeFullName(it.fullName);
    if (!norm) {
      result.skipped += 1;
      result.items.push({
        fullName: it.fullName,
        normalized: "",
        phone: null,
        action: "skipped",
        reason: "Пустое ФИО",
      });
      continue;
    }
    if (!map.has(norm)) map.set(norm, { ...it, fullName: it.fullName.trim() });
  }
  result.uniqueCount = map.size;

  // Существующие
  const norms = Array.from(map.keys());
  const existingByNorm = new Map<string, ManagerRow>();
  if (norms.length > 0) {
    // chunk по 500
    for (let i = 0; i < norms.length; i += 500) {
      const chunk = norms.slice(i, i + 500);
      const { data, error } = await supabaseAdmin
        .from("managers")
        .select("*")
        .in("normalized_name", chunk);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as ManagerRow[]) {
        existingByNorm.set(row.normalized_name, row);
      }
    }
  }

  const toInsert: Array<Record<string, unknown>> = [];
  for (const [norm, it] of map.entries()) {
    const phone = normalizeRuPhone(it.phone ?? null);
    const existing = existingByNorm.get(norm);
    if (existing) {
      // Не перетираем уже введённые поля; обновляем только пустые
      const patch: Record<string, unknown> = {};
      if (!existing.phone && phone) patch.phone = phone;
      if (!existing.comment && it.comment) patch.comment = it.comment;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabaseAdmin
          .from("managers")
          .update(patch as never)
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        result.updated += 1;
        result.items.push({
          fullName: it.fullName,
          normalized: norm,
          phone,
          action: "updated",
        });
      } else {
        result.skipped += 1;
        result.items.push({
          fullName: it.fullName,
          normalized: norm,
          phone,
          action: "skipped",
          reason: "Уже есть в справочнике",
        });
      }
      continue;
    }
    toInsert.push({
      full_name: it.fullName,
      normalized_name: norm,
      phone,
      comment: it.comment ?? null,
      is_active: it.isActive ?? true,
      status: "active",
      source: "import",
      created_by: createdBy,
    });
    result.items.push({
      fullName: it.fullName,
      normalized: norm,
      phone,
      action: "inserted",
    });
  }

  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("managers").insert(chunk as never);
      if (error) throw new Error(error.message);
    }
    result.inserted = toInsert.length;
  }

  return result;
}

export async function updateManager(args: {
  id: string;
  patch: Partial<{
    full_name: string;
    phone: string | null;
    comment: string | null;
    is_active: boolean;
    status: "active" | "needs_review" | "disabled";
  }>;
}) {
  const patch: Record<string, unknown> = { ...args.patch };
  if (typeof patch.full_name === "string") {
    patch.normalized_name = normalizeFullName(patch.full_name as string);
  }
  if (typeof patch.phone === "string") {
    patch.phone = normalizeRuPhone(patch.phone as string);
  }
  const { error } = await supabaseAdmin.from("managers").update(patch).eq("id", args.id);
  if (error) throw new Error(error.message);
}

export async function createManager(args: {
  fullName: string;
  phone?: string | null;
  comment?: string | null;
  createdBy: string | null;
}): Promise<ManagerRow> {
  const norm = normalizeFullName(args.fullName);
  if (!norm) throw new Error("Укажите ФИО менеджера");
  const phone = normalizeRuPhone(args.phone ?? null);
  const { data, error } = await supabaseAdmin
    .from("managers")
    .insert({
      full_name: args.fullName.trim(),
      normalized_name: norm,
      phone,
      comment: args.comment ?? null,
      is_active: true,
      status: "active",
      source: "manual",
      created_by: args.createdBy,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось создать менеджера");
  return data as ManagerRow;
}

export async function deleteManager(id: string) {
  const { error } = await supabaseAdmin.from("managers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Уведомление администратора, что в маршрутном листе встретился менеджер вне справочника. */
export async function notifyUnknownManager(args: {
  rawName: string;
  rawPhone?: string | null;
  routeId?: string | null;
  orderNumber?: string | null;
}) {
  await supabaseAdmin.from("notifications").insert({
    kind: "manager_unknown",
    title: "Неизвестный менеджер в маршрутном листе",
    body:
      `В маршрутном листе указан менеджер «${args.rawName}»` +
      (args.orderNumber ? ` (заказ №${args.orderNumber})` : "") +
      ", он не найден в справочнике.",
    payload: {
      raw_name: args.rawName,
      raw_phone: args.rawPhone ?? null,
      route_id: args.routeId ?? null,
      order_number: args.orderNumber ?? null,
      recipients: ["admin"],
    },
  });
}
