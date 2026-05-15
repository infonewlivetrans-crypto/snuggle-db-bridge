import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/driver/route/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "driver"]);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        const routeId = params.id;

        const { data: route, error } = await sb
          .from("delivery_routes")
          .select(
            "id, route_number, route_date, status, source_request_id, assigned_driver, assigned_vehicle, current_stage, driver_id",
          )
          .eq("id", routeId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!route) return jsonResponse({ error: "not_found" }, { status: 404 });

        // Админ — пропускаем; водитель — обязана быть привязка через drivers.user_id
        const isAdminCheck = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", auth.userId)
          .eq("role", "admin")
          .maybeSingle();
        const isAdmin = !!isAdminCheck.data;

        if (!isAdmin) {
          const { data: driverRow } = await sb
            .from("drivers")
            .select("id")
            .eq("user_id", auth.userId)
            .maybeSingle();
          const driverId = (driverRow as { id: string } | null)?.id ?? null;
          const routeDriverId = (route as { driver_id: string | null }).driver_id;
          if (!driverId || !routeDriverId || driverId !== routeDriverId) {
            return jsonResponse({ error: "forbidden" }, { status: 403 });
          }
        }

        return jsonResponse({ route });
      },
    },
  },
});
