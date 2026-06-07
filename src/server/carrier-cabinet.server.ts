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
 * Резолвит carrier контекст текущего пользователя.
 *
 * Порядок поиска связи user → dispatcher_carrier_ext:
 *  1) Новая таблица связей `dispatcher_carrier_users` (status='active') —
 *     основной механизм для AI-диспетчера. Привязку делает admin/dispatcher
 *     из карточки перевозчика.
 *  2) Fallback на profiles.carrier_id (для уже существующих кабинетов,
 *     созданных через общую регистрацию /carrier/register).
 *     profiles.carrier_id может указывать на:
 *       - dispatcher_carrier_ext.id;
 *       - dispatcher_carrier_ext.carrier_id (carriers.id);
 *       - production carriers.id (через dispatcher_carrier_ext.production_carrier_id).
 *
 * Если связи нет — возвращаем понятный no_carrier_linked, ничего не создавая.
 */
export async function resolveCarrierCtx(
  userId: string,
): Promise<CarrierCtx | Response> {
  const admin = makeAdminClient();

  // (1) Явная связь через dispatcher_carrier_users.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkRes = await (admin.from("dispatcher_carrier_users" as never) as any)
    .select("dispatcher_carrier_ext_id, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  const linkExtId = linkRes?.data?.dispatcher_carrier_ext_id as string | undefined;
  if (linkExtId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ext = await (admin.from("dispatcher_carrier_ext") as any)
      .select("id, carrier_id")
      .eq("id", linkExtId)
      .maybeSingle();
    if (ext?.data?.id) {
      return {
        carrierId: ext.data.carrier_id ?? linkExtId,
        dispatcherCarrierExtId: ext.data.id,
        admin,
      };
    }
  }

  // (2) Fallback: profiles.carrier_id.
  const { data: profile } = await admin
    .from("profiles")
    .select("carrier_id")
    .eq("user_id", userId)
    .maybeSingle();
  const profileCarrierId =
    (profile as { carrier_id: string | null } | null)?.carrier_id ?? null;

  if (profileCarrierId) {
    // 2a) profile.carrier_id === dispatcher_carrier_ext.id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byExtId = await (admin.from("dispatcher_carrier_ext") as any)
      .select("id, carrier_id")
      .eq("id", profileCarrierId)
      .maybeSingle();
    if (byExtId.data?.id) {
      return {
        carrierId: byExtId.data.carrier_id ?? profileCarrierId,
        dispatcherCarrierExtId: byExtId.data.id,
        admin,
      };
    }
    // 2b) profile.carrier_id === dispatcher_carrier_ext.carrier_id (carriers.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byCarrierId = await (admin.from("dispatcher_carrier_ext") as any)
      .select("id, carrier_id")
      .eq("carrier_id", profileCarrierId)
      .maybeSingle();
    if (byCarrierId.data?.id) {
      return {
        carrierId: profileCarrierId,
        dispatcherCarrierExtId: byCarrierId.data.id,
        admin,
      };
    }
    // 2c) profile.carrier_id === dispatcher_carrier_ext.production_carrier_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byProd = await (admin.from("dispatcher_carrier_ext") as any)
      .select("id, carrier_id")
      .eq("production_carrier_id", profileCarrierId)
      .maybeSingle();
    if (byProd.data?.id) {
      return {
        carrierId: byProd.data.carrier_id ?? profileCarrierId,
        dispatcherCarrierExtId: byProd.data.id,
        admin,
      };
    }
  }

  return jsonResponse(
    {
      error: "no_carrier_linked",
      reason: "no_carrier_linked",
      user_id: userId,
      profile_carrier_id: profileCarrierId,
      detail:
        "Пользователь не связан с карточкой перевозчика. Обратитесь к администратору.",
    },
    { status: 404 },
  );
}
