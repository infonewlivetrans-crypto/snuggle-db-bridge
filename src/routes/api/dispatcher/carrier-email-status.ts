// GET /api/dispatcher/carrier-email-status?carrier_ext_id=...
// Возвращает безопасный статус почты перевозчика (без пароля), чтобы диспетчер
// мог понять — подключена ли почта, и предупредить, если нет.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/carrier-email-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const carrierExtId = url.searchParams.get("carrier_ext_id");
        if (!carrierExtId)
          return jsonResponse({ error: "carrier_ext_id_required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from("dispatcher_carrier_email_accounts_safe" as never) as any)
          .select("email, from_name, is_active, is_verified, has_password, last_error, last_test_at")
          .eq("carrier_ext_id", carrierExtId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data ?? null });
      },
    },
  },
});
