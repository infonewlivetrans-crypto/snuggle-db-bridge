import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET /api/carrier/drivers — read-only view of production `drivers`
// filtered by current carrier. No new business logic, no writes.

export const Route = createFileRoute("/api/carrier/drivers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) {
          return jsonResponse({
            ok: false,
            reason: "no_carrier_linked",
            rows: [],
            total: 0,
          });
        }

        const { data, error } = await ctx.admin
          .from("drivers")
          .select(
            "id, full_name, phone, license_number, license_categories, " +
              "is_active, created_at",
          )
          .eq("carrier_id", ctx.carrierId)
          .order("created_at", { ascending: false });
        if (error)
          return jsonResponse(
            { ok: false, error: error.message, rows: [], total: 0 },
            { status: 200 },
          );
        return jsonResponse({
          ok: true,
          rows: data ?? [],
          total: data?.length ?? 0,
        });
      },
    },
  },
});
