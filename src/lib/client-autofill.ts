// Утилиты автоподстановки данных клиента.
// Используются при создании заказа вручную и при импорте файла:
// - находим существующего клиента по имени или телефону;
// - возвращаем сохранённые поля для подстановки в форму/заказ;
// - тихий upsert (создаём при отсутствии, обновляем только пустые поля у существующего).
//
// Никогда не использовать @/server/* — это чисто клиентский модуль.

import { supabase } from "@/integrations/supabase/client";
import { normalizeRuPhone } from "@/lib/phone";
import type { ClientKind } from "@/lib/orders";

export type ClientRecord = {
  id: string;
  name: string;
  phone: string | null;
  phone_alt: string | null;
  email: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  manager_name: string | null;
  manager_phone: string | null;
  working_hours: string | null;
  works_weekends: boolean;
  client_type: ClientKind | null;
  access_notes: string | null;
  unloading_notes: string | null;
  preferred_delivery_time: string | null;
  driver_instructions: string | null;
  extra_attrs: Record<string, unknown> | null;
};

const SELECT_COLS =
  "id,name,phone,phone_alt,email,address,latitude,longitude,manager_name,manager_phone," +
  "working_hours,works_weekends,client_type,access_notes,unloading_notes," +
  "preferred_delivery_time,driver_instructions,extra_attrs";

/** Находит клиента по имени (без регистра) или телефону (нормализованному). */
export async function findClient(params: {
  name?: string | null;
  phone?: string | null;
}): Promise<ClientRecord | null> {
  const name = params.name?.trim() || null;
  const phoneE164 = normalizeRuPhone(params.phone);

  if (!name && !phoneE164) return null;

  // 1) Точный матч по телефону (нормализованному)
  if (phoneE164) {
    const { data } = await supabase
      .from("clients")
      .select(SELECT_COLS)
      .or(`phone.eq.${phoneE164},phone_alt.eq.${phoneE164}`)
      .limit(1)
      .maybeSingle();
    if (data) return data as unknown as ClientRecord;
  }

  // 2) По имени (case-insensitive)
  if (name) {
    const safe = name.replace(/[%,]/g, "");
    const { data } = await supabase
      .from("clients")
      .select(SELECT_COLS)
      .ilike("name", safe)
      .limit(1)
      .maybeSingle();
    if (data) return data as unknown as ClientRecord;
  }
  return null;
}

/**
 * Тихий upsert клиента: создаёт нового если нет; для существующего
 * обновляет ТОЛЬКО пустые поля. Уже сохранённые данные не затирает.
 */
export async function upsertClientSilent(input: {
  name: string;
  phone?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  client_type?: ClientKind | null;
  working_hours?: string | null;
  works_weekends?: boolean | null;
  access_notes?: string | null;
  unloading_notes?: string | null;
  preferred_delivery_time?: string | null;
  driver_instructions?: string | null;
}): Promise<ClientRecord | null> {
  const name = input.name.trim();
  if (!name) return null;
  const phone = normalizeRuPhone(input.phone) ?? input.phone?.trim() ?? null;

  const existing = await findClient({ name, phone });

  if (!existing) {
    const { data, error } = await supabase
      .from("clients")
      .insert({
        name,
        phone,
        address: input.address ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        client_type: input.client_type ?? null,
        working_hours: input.working_hours ?? null,
        works_weekends: input.works_weekends ?? false,
        access_notes: input.access_notes ?? null,
        unloading_notes: input.unloading_notes ?? null,
        preferred_delivery_time: input.preferred_delivery_time ?? null,
        driver_instructions: input.driver_instructions ?? null,
        source: "manual",
      } as never)
      .select(SELECT_COLS)
      .single();
    if (error) return null;
    return data as unknown as ClientRecord;
  }

  // Обновляем только пустые поля
  const patch: Record<string, unknown> = {};
  const setIfEmpty = (key: keyof ClientRecord, val: unknown) => {
    if (val === null || val === undefined || val === "") return;
    if (existing[key] === null || existing[key] === undefined || existing[key] === "") {
      patch[key as string] = val;
    }
  };
  setIfEmpty("phone", phone);
  setIfEmpty("address", input.address ?? null);
  setIfEmpty("latitude", input.latitude ?? null);
  setIfEmpty("longitude", input.longitude ?? null);
  setIfEmpty("client_type", input.client_type ?? null);
  setIfEmpty("working_hours", input.working_hours ?? null);
  setIfEmpty("access_notes", input.access_notes ?? null);
  setIfEmpty("unloading_notes", input.unloading_notes ?? null);
  setIfEmpty("preferred_delivery_time", input.preferred_delivery_time ?? null);
  setIfEmpty("driver_instructions", input.driver_instructions ?? null);

  if (Object.keys(patch).length === 0) return existing;
  const { data } = await supabase
    .from("clients")
    .update(patch as never)
    .eq("id", existing.id)
    .select(SELECT_COLS)
    .single();
  return (data as unknown as ClientRecord) ?? existing;
}

/**
 * Возвращает значения для автозаполнения пустых полей заказа на основе
 * клиента. Никогда не перезаписывает уже заполненные поля заказа.
 */
export function buildOrderAutofillFromClient(
  client: ClientRecord,
  current: {
    delivery_address?: string | null;
    contact_phone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    client_type?: ClientKind | null;
    access_instructions?: string | null;
    delivery_time_comment?: string | null;
    client_works_weekends?: boolean | null;
  } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fillIfEmpty = (key: string, currentVal: unknown, newVal: unknown) => {
    if (newVal === null || newVal === undefined || newVal === "") return;
    if (currentVal === null || currentVal === undefined || currentVal === "") {
      out[key] = newVal;
    }
  };
  fillIfEmpty("delivery_address", current.delivery_address, client.address);
  fillIfEmpty("contact_phone", current.contact_phone, client.phone);
  fillIfEmpty("latitude", current.latitude, client.latitude);
  fillIfEmpty("longitude", current.longitude, client.longitude);
  fillIfEmpty("client_type", current.client_type, client.client_type);
  fillIfEmpty(
    "access_instructions",
    current.access_instructions,
    [client.access_notes, client.unloading_notes, client.driver_instructions]
      .filter(Boolean)
      .join("\n") || null,
  );
  fillIfEmpty(
    "delivery_time_comment",
    current.delivery_time_comment,
    client.preferred_delivery_time,
  );
  if (
    (current.client_works_weekends === null || current.client_works_weekends === undefined) &&
    client.works_weekends
  ) {
    out.client_works_weekends = true;
  }
  return out;
}
