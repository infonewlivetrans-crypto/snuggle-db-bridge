// Helper для кабинета перевозчика: определяет carrier текущего пользователя.
// Используется во всех /api/carrier/* endpoints для жёсткой изоляции данных.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { makeAdminClient, jsonResponse } from "@/server/api-helpers.server";

export interface CarrierCtx {
  carrierId: string;
  dispatcherCarrierExtId: string;
  admin: SupabaseClient<Database>;
}

/**
 * Резолвит carrier_id текущего пользователя из profiles, а также соответствующий
 * dispatcher_carrier_ext.id. Возвращает Response с 404, если связи нет.
 */
export async function resolveCarrierCtx(userId: string): Promise<CarrierCtx | Response> {
  const admin = makeAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("carrier_id")
    .eq("user_id", userId)
    .maybeSingle();
  const carrierId = (profile as { carrier_id: string | null } | null)?.carrier_id ?? null;
  if (!carrierId) {
    return jsonResponse({ error: "no_carrier_linked" }, { status: 404 });
  }

  const { data: ext } = await admin
    .from("dispatcher_carrier_ext")
    .select("id")
    .eq("carrier_id", carrierId)
    .maybeSingle();
  let dispatcherCarrierExtId = (ext as { id: string } | null)?.id ?? "";

  // Если carrier создан вне ai-диспетчера и ext-записи нет — создаём минимальную,
  // чтобы личный кабинет работал без обращения к админу. Это безопасно: ext —
  // расширение существующего carrier.
  if (!dispatcherCarrierExtId) {
    const { data: created } = await admin
      .from("dispatcher_carrier_ext")
      .insert({
        carrier_id: carrierId,
        commission_rate: 0.05,
        verification_status: "new",
      } as never)
      .select("id")
      .single();
    dispatcherCarrierExtId = (created as { id: string } | null)?.id ?? "";
  }

  if (!dispatcherCarrierExtId) {
    return jsonResponse({ error: "no_carrier_ext" }, { status: 500 });
  }

  return { carrierId, dispatcherCarrierExtId, admin };
}
