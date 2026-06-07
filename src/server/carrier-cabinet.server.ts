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

export interface CarrierCtxDebug {
  userId: string;
  profileCarrierId: string | null;
  matchedBy: "ext.id" | "ext.carrier_id" | "ext.production_carrier_id" | "created" | null;
}

/**
 * Резолвит carrier контекст текущего пользователя.
 *
 * profiles.carrier_id может указывать на разное:
 *   - dispatcher_carrier_ext.id (новая регистрация через /carrier/register);
 *   - dispatcher_carrier_ext.carrier_id (carriers.id), если ext создан в ai-диспетчере;
 *   - production carriers.id, если запись создана в старом контуре.
 *
 * Поэтому ищем ext всеми доступными способами. При невозможности — возвращаем
 * понятный no_carrier_linked, не пытаясь массово создавать новые записи.
 */
export async function resolveCarrierCtx(
  userId: string,
): Promise<CarrierCtx | Response> {
  const admin = makeAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("carrier_id")
    .eq("user_id", userId)
    .maybeSingle();
  const profileCarrierId =
    (profile as { carrier_id: string | null } | null)?.carrier_id ?? null;

  if (!profileCarrierId) {
    return jsonResponse(
      {
        error: "no_carrier_linked",
        reason: "no_carrier_linked",
        user_id: userId,
        profile_carrier_id: null,
        detail: "У профиля пользователя не указан carrier_id",
      },
      { status: 404 },
    );
  }

  // 1) profile.carrier_id === dispatcher_carrier_ext.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byExtId = await (admin.from("dispatcher_carrier_ext") as any)
    .select("id, carrier_id")
    .eq("id", profileCarrierId)
    .maybeSingle();
  if (byExtId.data?.id) {
    return { carrierId: byExtId.data.carrier_id ?? profileCarrierId, dispatcherCarrierExtId: byExtId.data.id, admin };
  }

  // 2) profile.carrier_id === dispatcher_carrier_ext.carrier_id (carriers.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byCarrierId = await (admin.from("dispatcher_carrier_ext") as any)
    .select("id, carrier_id")
    .eq("carrier_id", profileCarrierId)
    .maybeSingle();
  if (byCarrierId.data?.id) {
    return { carrierId: profileCarrierId, dispatcherCarrierExtId: byCarrierId.data.id, admin };
  }

  // 3) profile.carrier_id === dispatcher_carrier_ext.production_carrier_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byProd = await (admin.from("dispatcher_carrier_ext") as any)
    .select("id, carrier_id")
    .eq("production_carrier_id", profileCarrierId)
    .maybeSingle();
  if (byProd.data?.id) {
    return { carrierId: byProd.data.carrier_id ?? profileCarrierId, dispatcherCarrierExtId: byProd.data.id, admin };
  }

  // Связи нет — возвращаем понятный no_carrier_linked, ничего не создаём,
  // чтобы не трогать production carriers и не плодить мусорные ext-записи.
  return jsonResponse(
    {
      error: "no_carrier_linked",
      reason: "no_carrier_linked",
      user_id: userId,
      profile_carrier_id: profileCarrierId,
      detail:
        "profile.carrier_id не сопоставлен ни с dispatcher_carrier_ext.id, ни с carrier_id, ни с production_carrier_id",
    },
    { status: 404 },
  );
}
