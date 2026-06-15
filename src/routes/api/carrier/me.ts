import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

// GET /api/carrier/me — данные кабинета перевозчика.
// Работает БЕЗ SUPABASE_SERVICE_ROLE_KEY: вызывает SECURITY DEFINER RPC
// `carrier_me_get()`, который сам проверяет auth.uid() и резолвит carrier.
export const Route = createFileRoute("/api/carrier/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.rpc as any)("carrier_me_get");
        if (error) {
          return jsonResponse(
            { ok: false, error: "rpc_failed", detail: error.message },
            { status: 500 },
          );
        }
        const payload = (data ?? { ok: false, error: "no_carrier_linked" }) as Record<
          string,
          unknown
        >;
        return jsonResponse(payload, { status: 200 });
      },
    },
  },
});
