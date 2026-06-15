import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET  /api/carrier/vehicles — список транспорта текущего перевозчика.
// POST /api/carrier/vehicles — создание машины в dispatcher_vehicle_ext.
//
// Production: NO service_role. Используется user-client + RLS
// ("dve carrier *" политики), карточка резолвится через carrier_my_ext_id().

type VehicleRow = {
  id: string;
  plate_number: string;
  brand: string | null;
  model: string | null;
  vehicle_kind: string | null;
  body_type: string | null;
  capacity_kg: number | null;
  payload_kg: number | null;
  volume_m3: number | null;
  body_length_m: number | null;
  body_width_m: number | null;
  body_height_m: number | null;
  home_city: string | null;
  ready_date: string | null;
  load_methods: string[] | null;
  dispatcher_status: string | null;
  has_tent: boolean | null;
  has_straps: boolean | null;
  has_manipulator: boolean | null;
  comment: string | null;
  is_active: boolean | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  source: "production" | "dispatcher";
  current_city: string | null;
  current_lat: number | null;
  current_lng: number | null;
  ready_to_cities: string[] | null;
  ready_comment: string | null;
  ready_radius_km: number | null;
  ready_mode: string | null;
  ready_weekdays: number[] | null;
  ready_from: string | null;
  load_status: string | null;
  free_payload_kg: number | null;
  free_volume_m3: number | null;
  partial_route_from: string | null;
  partial_route_to: string | null;
  loading_restrictions: string | null;
  location_source: string | null;
  location_updated_at: string | null;
};

const EXT_INACTIVE = new Set(["blocked", "archive", "inactive"]);
const READY_STATUSES = new Set(["ready_to_work", "available", "free"]);

const CARRIER_VEHICLE_STATUSES = new Set([
  "new",
  "docs_unchecked",
  "available",
  "waiting_freight",
  "on_trip",
  "resting",
  "inactive",
  "archive",
]);

const CARRIER_INSERT_FIELDS = [
  "vehicle_kind",
  "body_type",
  "payload_kg",
  "volume_m3",
  "length_m",
  "width_m",
  "height_m",
  "load_methods",
  "home_city",
  "current_city",
  "ready_to_cities",
  "ready_date",
  "ready_from",
  "ready_radius_km",
  "ready_mode",
  "ready_weekdays",
  "ready_comment",
  "loading_restrictions",
  "dispatcher_comment",
  "dispatcher_driver_ext_id",
  "min_rate",
  "minimum_trip_rate",
  "minimum_km_rate",
  "city_rate",
  "point_rate",
  "rate_comment",
] as const;

export const Route = createFileRoute("/api/carrier/vehicles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) {
          return jsonResponse({
            ok: false,
            reason: "no_carrier_linked",
            rows: [],
            total: 0,
          });
        }

        const rows: VehicleRow[] = [];
        const seenProdIds = new Set<string>();

        const prodRes = await ctx.admin
          .from("vehicles")
          .select(
            "id, plate_number, brand, model, body_type, capacity_kg, volume_m3, " +
              "body_length_m, body_width_m, body_height_m, has_tent, has_straps, " +
              "has_manipulator, comment, is_active, created_at",
          )
          .eq("carrier_id", ctx.carrierId)
          .order("created_at", { ascending: false });
        if (!prodRes.error && prodRes.data) {
          for (const v of prodRes.data as unknown as Array<{
            id: string;
            plate_number: string;
            brand: string | null;
            model: string | null;
            body_type: string | null;
            capacity_kg: number | null;
            volume_m3: number | null;
            body_length_m: number | null;
            body_width_m: number | null;
            body_height_m: number | null;
            has_tent: boolean | null;
            has_straps: boolean | null;
            has_manipulator: boolean | null;
            comment: string | null;
            is_active: boolean | null;
          }>) {
            rows.push({
              ...v,
              vehicle_kind: null,
              payload_kg: v.capacity_kg,
              home_city: null,
              ready_date: null,
              load_methods: null,
              dispatcher_status: null,
              driver_id: null,
              driver_name: null,
              driver_phone: null,
              source: "production",
              current_city: null,
              current_lat: null,
              current_lng: null,
              ready_to_cities: null,
              ready_comment: null,
              ready_radius_km: null,
              ready_mode: null,
              ready_weekdays: null,
              ready_from: null,
              load_status: null,
              free_payload_kg: null,
              free_volume_m3: null,
              partial_route_from: null,
              partial_route_to: null,
              loading_restrictions: null,
              location_source: null,
              location_updated_at: null,
            });
            seenProdIds.add(v.id);
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extRes = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .select(
            "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, " +
              "height_m, home_city, ready_date, ready_from, ready_radius_km, ready_mode, " +
              "ready_weekdays, load_methods, dispatcher_status, dispatcher_driver_ext_id, " +
              "dispatcher_comment, production_vehicle_id, created_at, " +
              "current_city, current_lat, current_lng, ready_to_cities, ready_comment, " +
              "load_status, free_payload_kg, free_volume_m3, partial_route_from, " +
              "partial_route_to, loading_restrictions, location_source, location_updated_at",
          )
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .order("created_at", { ascending: false });

        const extRows = (extRes.data ?? []) as Array<Record<string, unknown>>;

        const driverIds = Array.from(
          new Set(
            extRows
              .map((v) => v.dispatcher_driver_ext_id as string | null)
              .filter((x): x is string => !!x),
          ),
        );
        const driverMap = new Map<string, { full_name: string | null; phone: string | null }>();
        if (driverIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const drvRes = await (ctx.admin.from("dispatcher_driver_ext" as never) as any)
            .select("id, full_name, phone")
            .in("id", driverIds);
          if (!drvRes.error && drvRes.data) {
            for (const d of drvRes.data as Array<{
              id: string;
              full_name: string | null;
              phone: string | null;
            }>) {
              driverMap.set(d.id, { full_name: d.full_name, phone: d.phone });
            }
          }
        }

        for (const v of extRows) {
          const prodId = v.production_vehicle_id as string | null;
          if (prodId && seenProdIds.has(prodId)) continue;
          const driverExtId = v.dispatcher_driver_ext_id as string | null;
          const drv = driverExtId ? driverMap.get(driverExtId) : null;
          rows.push({
            id: v.id as string,
            plate_number: (v.vehicle_kind as string | null) ?? "—",
            brand: null,
            model: null,
            vehicle_kind: v.vehicle_kind as string | null,
            body_type: v.body_type as string | null,
            capacity_kg: v.payload_kg as number | null,
            payload_kg: v.payload_kg as number | null,
            volume_m3: v.volume_m3 as number | null,
            body_length_m: v.length_m as number | null,
            body_width_m: v.width_m as number | null,
            body_height_m: v.height_m as number | null,
            home_city: v.home_city as string | null,
            ready_date: v.ready_date as string | null,
            load_methods: v.load_methods as string[] | null,
            dispatcher_status: v.dispatcher_status as string | null,
            has_tent: null,
            has_straps: null,
            has_manipulator: null,
            comment: v.dispatcher_comment as string | null,
            is_active: !EXT_INACTIVE.has((v.dispatcher_status as string | null) ?? ""),
            driver_id: driverExtId,
            driver_name: drv?.full_name ?? null,
            driver_phone: drv?.phone ?? null,
            source: "dispatcher",
            current_city: v.current_city as string | null,
            current_lat: v.current_lat as number | null,
            current_lng: v.current_lng as number | null,
            ready_to_cities: v.ready_to_cities as string[] | null,
            ready_comment: v.ready_comment as string | null,
            ready_radius_km: v.ready_radius_km as number | null,
            ready_mode: v.ready_mode as string | null,
            ready_weekdays: v.ready_weekdays as number[] | null,
            ready_from: v.ready_from as string | null,
            load_status: v.load_status as string | null,
            free_payload_kg: v.free_payload_kg as number | null,
            free_volume_m3: v.free_volume_m3 as number | null,
            partial_route_from: v.partial_route_from as string | null,
            partial_route_to: v.partial_route_to as string | null,
            loading_restrictions: v.loading_restrictions as string | null,
            location_source: v.location_source as string | null,
            location_updated_at: v.location_updated_at as string | null,
          });
        }

        return jsonResponse({
          ok: true,
          rows,
          total: rows.length,
          ready_statuses: Array.from(READY_STATUSES),
        });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }

        const insert: Record<string, unknown> = {
          dispatcher_carrier_ext_id: ctx.dispatcherCarrierExtId,
          dispatcher_status: "new",
        };
        for (const k of CARRIER_INSERT_FIELDS) {
          if (k in body) insert[k] = body[k];
        }
        if (
          typeof body.dispatcher_status === "string" &&
          CARRIER_VEHICLE_STATUSES.has(body.dispatcher_status)
        ) {
          insert.dispatcher_status = body.dispatcher_status;
        }

        // Enrich location (geocode current_city/home_city when no coords provided).
        try {
          const { enrichVehicleLocation } = await import("@/server/vehicle-location.server");
          await enrichVehicleLocation(ctx.admin, insert, "carrier", { existing: null });
        } catch (e) {
          console.warn("[carrier vehicles POST] enrich failed:", (e as Error).message);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ins = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .insert(insert)
          .select("id")
          .single();
        if (ins.error) {
          return jsonResponse(
            { error: "insert_failed", detail: ins.error.message },
            { status: 400 },
          );
        }
        return jsonResponse({ ok: true, id: ins.data.id });
      },
    },
  },
});

export { CARRIER_INSERT_FIELDS, CARRIER_VEHICLE_STATUSES };
