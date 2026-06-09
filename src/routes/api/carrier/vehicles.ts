import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET /api/carrier/vehicles — read-only view of production `vehicles`
// filtered by current carrier. No new business logic, no writes.

export const Route = createFileRoute("/api/carrier/vehicles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) {
          // no_carrier_linked → отдадим пустой список 200, а не 404,
          // чтобы UI кабинета не падал и не показывал ошибку.
          return jsonResponse({
            ok: false,
            reason: "no_carrier_linked",
            rows: [],
            total: 0,
          });
        }

        const { data, error } = await ctx.admin
          .from("vehicles")
          .select(
            "id, plate_number, brand, model, body_type, capacity_kg, volume_m3, " +
              "body_length_m, body_width_m, body_height_m, has_tent, has_straps, " +
              "has_manipulator, comment, is_active, created_at",
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
