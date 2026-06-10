// Helper для кабинета перевозчика: определяет carrier текущего пользователя.
// Используется во всех /api/carrier/* endpoints для жёсткой изоляции данных.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { makeAdminClient, jsonResponse } from "@/server/api-helpers.server";
import { ensureCarrierLink } from "@/server/carrier-autolink.server";

export interface CarrierCtx {
  carrierId: string;
  dispatcherCarrierExtId: string;
  admin: SupabaseClient<Database>;
}

/**
 * Резолвит carrier контекст текущего пользователя.
 *
 * Порядок поиска связи user → dispatcher_carrier_ext:
 *  1) ensureCarrierLink — авто-связка по dispatcher_carrier_users,
 *     по уже использованному токену carrier_account_links или по
 *     отложенному токену в auth.user_metadata. Пользователь ничего
 *     не нажимает руками.
 *  2) Fallback на profiles.carrier_id (для уже существующих кабинетов,
 *     созданных через общую регистрацию /carrier/register).
 *
 * Если связи нет — возвращаем понятный no_carrier_linked, ничего не создавая.
 */
export async function resolveCarrierCtx(
  userId: string,
): Promise<CarrierCtx | Response> {
  const admin = makeAdminClient();

  // (1) Авто-связка
  const auto = await ensureCarrierLink(admin, userId);
  if (auto) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ext = await (admin.from("dispatcher_carrier_ext") as any)
      .select("id, carrier_id")
      .eq("id", auto.extId)
      .maybeSingle();
    if (ext?.data?.id) {
      return {
        carrierId: ext.data.carrier_id ?? auto.extId,
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
