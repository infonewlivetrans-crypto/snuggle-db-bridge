import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

// GET /api/carrier/me — данные кабинета перевозчика.
// Перед чтением вызывает `carrier_self_heal()`, чтобы пользователи, у которых
// в profiles.carrier_id уже выставлен carrier, но не выдана роль/связь
// dispatcher_carrier_users (исторический баг), получили их автоматически и
// сразу могли работать с кабинетом без 403 на остальных /api/carrier/*.
export const Route = createFileRoute("/api/carrier/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const heal = await (auth.client.rpc as any)("carrier_self_heal");
          if (heal?.error) {
            console.warn("[carrier-me] self_heal_failed", heal.error.message);
          } else if (heal?.data?.changed) {
            console.log(
              "[carrier-me] self_heal_applied user=%s carrier=%s ext=%s",
              auth.userId,
              heal.data.carrier_id,
              heal.data.ext_id,
            );
          }
        } catch (e) {
          console.warn("[carrier-me] self_heal_exception", e);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.rpc as any)("carrier_me_get");
        if (error) {
          console.error("[carrier-me] rpc_failed", error.message);
          return jsonResponse(
            { ok: false, error: "rpc_failed", detail: error.message },
            { status: 500 },
          );
        }
        const payload = (data ?? { ok: false, error: "no_carrier_linked" }) as Record<
          string,
          unknown
        >;
        if (payload && payload.ok === false) {
          console.warn(
            "[carrier-me] no_access user=%s reason=%s profile_carrier=%s",
            auth.userId,
            payload.reason ?? payload.error ?? "unknown",
            payload.profile_carrier_id ?? "null",
          );
        }
        return jsonResponse(payload, { status: 200 });
      },
    },
  },
});
