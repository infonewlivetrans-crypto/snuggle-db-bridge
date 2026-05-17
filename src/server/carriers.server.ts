import { makeAdminClient } from "@/server/api-helpers.server";
const supabaseAdmin = makeAdminClient();
const DEFAULT_CARRIER_NAME = "Без перевозчика";

/**
 * Возвращает id перевозчика "Без перевозчика", создавая его при первом обращении.
 * Используется как fallback при импорте водителей и (в будущем) при импорте маршрутных листов.
 */
export async function ensureDefaultCarrierId(): Promise<string> {
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
