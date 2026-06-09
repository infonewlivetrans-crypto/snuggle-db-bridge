import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];
const TABLE = "dispatcher_contract_acceptances";
const SELECT =
  "id, dispatcher_carrier_ext_id, contract_type, contract_version, contract_title, " +
  "commission_rate, minimum_fee, accepted_by_name, accepted_by_phone, accepted_by_email, " +
  "accepted_at, source, user_id";

// Совместимость со старым клиентом, который ходил на плоский путь.
// Поддерживает фильтр ?carrier_id=... (= dispatcher_carrier_ext_id).
export const Route = createFileRoute("/api/dispatcher/carrier-acceptances")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const carrierId =
          url.searchParams.get("carrier_id") ??
          url.searchParams.get("dispatcher_carrier_ext_id");

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = (auth.client.from(TABLE as never) as any).select(SELECT);
          if (carrierId) q = q.eq("dispatcher_carrier_ext_id", carrierId);
          q = q.order("accepted_at", { ascending: false });
          const { data, error } = await q;
          if (error) {
            // Безопасный fallback, чтобы UI не падал.
            return jsonResponse({ rows: [], total: 0 });
          }
          return jsonResponse({ rows: data ?? [], total: (data ?? []).length });
        } catch {
          return jsonResponse({ rows: [], total: 0 });
        }
      },
    },
  },
});
