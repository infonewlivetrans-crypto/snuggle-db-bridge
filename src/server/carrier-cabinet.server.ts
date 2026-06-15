// Helper для кабинета перевозчика: резолвит carrier_ext_id текущего пользователя
// через SECURITY DEFINER RPC `carrier_my_ext_id()`. Никаких makeAdminClient
// и SUPABASE_SERVICE_ROLE_KEY — всё через user-client + RLS / RPC.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { jsonResponse } from "@/server/api-helpers.server";

export interface CarrierCtx {
  /** dispatcher_carrier_ext.id текущего пользователя. */
  dispatcherCarrierExtId: string;
  /** carriers.id (если есть в ext), иначе совпадает с extId. */
  carrierId: string;
  /** user-client с Bearer-токеном текущего пользователя; RLS применяется. */
  client: SupabaseClient<Database>;
  userId: string;
  /**
   * Совместимость со старым кодом — alias для client.
   * @deprecated используйте `client`.
   */
  admin: SupabaseClient<Database>;
}

export async function resolveCarrierCtx(
  auth: { userId: string; client: SupabaseClient<Database> },
): Promise<CarrierCtx | Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: extId, error } = await (auth.client.rpc as any)("carrier_my_ext_id");
  if (error) {
    return jsonResponse(
      { error: "rpc_failed", detail: error.message },
      { status: 500 },
    );
  }
  if (!extId) {
    return jsonResponse(
      {
        error: "no_carrier_linked",
        reason: "no_carrier_linked",
        user_id: auth.userId,
        detail:
          "Пользователь не связан с карточкой перевозчика. Обратитесь к администратору.",
      },
      { status: 404 },
    );
  }

  // Подтянем carrier_id из ext (теперь RLS разрешает carrier читать own).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ext } = await (auth.client.from("dispatcher_carrier_ext") as any)
    .select("id, carrier_id")
    .eq("id", extId)
    .maybeSingle();

  const carrierId = (ext?.carrier_id as string | null) ?? (extId as string);
  return {
    dispatcherCarrierExtId: extId as string,
    carrierId,
    client: auth.client,
    admin: auth.client,
    userId: auth.userId,
  };
}
