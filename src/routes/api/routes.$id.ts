import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

const ALLOWED = new Set([
  "status",
  "comment",
  "points_order_changed_at",
  "points_order_changed_by",
]);

export const Route = createFileRoute("/api/routes/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("routes")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const r = data as Record<string, unknown> & {
          warehouse_id?: string | null;
          destination_warehouse_id?: string | null;
          vehicle_id?: string | null;
          driver_id?: string | null;
        };
        const [wh, dwh, veh, drv] = await Promise.all([
          r.warehouse_id
            ? auth.client.from("warehouses").select("id, name, city, address").eq("id", r.warehouse_id).maybeSingle()
            : Promise.resolve({ data: null }),
          r.destination_warehouse_id
            ? auth.client.from("warehouses").select("id, name, city").eq("id", r.destination_warehouse_id).maybeSingle()
            : Promise.resolve({ data: null }),
          r.vehicle_id
            ? auth.client
                .from("vehicles")
                .select("id, plate_number, brand, model, body_type, capacity_kg, volume_m3")
                .eq("id", r.vehicle_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          r.driver_id
            ? auth.client.from("drivers").select("id, full_name, phone").eq("id", r.driver_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        return jsonResponse(
          {
            ...r,
            warehouse: wh.data ?? null,
            destination_warehouse: dwh.data ?? null,
            vehicle: veh.data ?? null,
            driver: drv.data ?? null,
          },
          { headers: cacheHeaders(30) },
        );
      },

      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body)) {
          if (ALLOWED.has(k)) updates[k] = v;
        }
        if (Object.keys(updates).length === 0) {
          return jsonResponse({ error: "Нет допустимых полей" }, { status: 400 });
        }
        const { error } = await auth.client.from("routes").update(updates as never).eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
