import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET /api/carrier/drivers — список водителей текущего перевозчика.
// Источник — dispatcher_driver_ext (фильтр по dispatcher_carrier_ext_id).
// Дополнительно подтягивает назначенный транспорт.

export const Route = createFileRoute("/api/carrier/drivers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: drivers, error } = await (
          ctx.admin.from("dispatcher_driver_ext" as never) as any
        )
          .select(
            "id, driver_id, full_name, phone, email, city, dispatcher_status, docs_status, dispatcher_comment, created_at",
          )
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        // Назначенный транспорт: vehicles, где dispatcher_driver_ext_id указывает на этих водителей
        const driverIds = (drivers ?? []).map((d: { id: string }) => d.id);
        let vehiclesByDriver: Record<string, Array<{ id: string; vehicle_kind: string | null }>> =
          {};
        if (driverIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: vehs } = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
            .select("id, vehicle_kind, dispatcher_driver_ext_id")
            .in("dispatcher_driver_ext_id", driverIds)
            .neq("dispatcher_status", "archive");
          vehiclesByDriver = (vehs ?? []).reduce(
            (
              acc: Record<string, Array<{ id: string; vehicle_kind: string | null }>>,
              v: { id: string; vehicle_kind: string | null; dispatcher_driver_ext_id: string },
            ) => {
              (acc[v.dispatcher_driver_ext_id] ??= []).push({
                id: v.id,
                vehicle_kind: v.vehicle_kind,
              });
              return acc;
            },
            {},
          );
        }

        const rows = (drivers ?? []).map((d: { id: string }) => ({
          ...d,
          vehicles: vehiclesByDriver[d.id] ?? [],
        }));
        return jsonResponse({ rows, total: rows.length });
      },
    },
  },
});
