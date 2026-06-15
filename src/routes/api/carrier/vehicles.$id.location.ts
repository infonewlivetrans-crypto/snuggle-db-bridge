import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// POST /api/carrier/vehicles/:id/location
// Перевозчик/водитель присылает GPS-координаты с устройства.
// body: { lat, lng, source?: 'gps' | 'carrier' | 'driver' }
// Если GPS недоступен и пришёл только { city } — серверный Yandex-геокод.

export const Route = createFileRoute("/api/carrier/vehicles/$id/location")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id_required" }, { status: 400 });
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }

        const lat = body.lat != null ? Number(body.lat) : null;
        const lng = body.lng != null ? Number(body.lng) : null;
        const city = typeof body.city === "string" ? body.city.trim() : "";
        const source =
          body.source === "gps" || body.source === "driver" ? (body.source as string) : "carrier";

        const update: Record<string, unknown> = {};

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          update.current_lat = lat;
          update.current_lng = lng;
          update.location_source = source;
          update.location_updated_at = new Date().toISOString();
        } else if (city) {
          update.current_city = city;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
            .select("current_city,current_lat,current_lng,location_source")
            .eq("id", params.id)
            .maybeSingle();
          if (existing.error)
            return jsonResponse({ error: existing.error.message }, { status: 500 });
          if (!existing.data) return jsonResponse({ error: "not_found" }, { status: 404 });
          try {
            const { enrichVehicleLocation } = await import("@/server/vehicle-location.server");
            await enrichVehicleLocation(ctx.admin, update, "carrier", {
              vehicleId: params.id,
              existing: existing.data,
            });
          } catch (e) {
            console.warn("[carrier vehicles location] enrich failed:", (e as Error).message);
          }
        } else {
          return jsonResponse(
            { error: "validation_failed", detail: "lat+lng OR city required" },
            { status: 400 },
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .update(update)
          .eq("id", params.id)
          .select("id,current_lat,current_lng,current_city,location_source,location_updated_at")
          .single();
        if (upd.error) {
          if (upd.error.code === "42501")
            return jsonResponse({ error: "forbidden" }, { status: 403 });
          return jsonResponse(
            { error: "update_failed", detail: upd.error.message },
            { status: 400 },
          );
        }
        return jsonResponse({ ok: true, row: upd.data });
      },
    },
  },
});
