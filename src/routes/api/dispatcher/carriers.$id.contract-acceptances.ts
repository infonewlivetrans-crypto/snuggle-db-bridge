import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];
const TABLE = "dispatcher_contract_acceptances";
const SELECT =
  "id, dispatcher_carrier_ext_id, contract_type, contract_version, contract_title, " +
  "commission_rate, minimum_fee, accepted_by_name, accepted_by_phone, accepted_by_email, " +
  "accepted_at, source, user_id";

export const Route = createFileRoute(
  "/api/dispatcher/carriers/$id/contract-acceptances",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .select(SELECT)
          .eq("dispatcher_carrier_ext_id", params.id)
          .order("accepted_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [] });
      },
    },
  },
});
