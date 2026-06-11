import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET /api/carrier/vehicles — транспорт текущего перевозчика.
// Источник 1: production `vehicles` по carrier_id (только для совместимости).
// Источник 2: `dispatcher_vehicle_ext` по dispatcher_carrier_ext_id —
//             основной источник кабинета AI-диспетчера.
// Дополнительно подтягиваем связанного водителя из dispatcher_driver_ext.

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
  // readiness reported by carrier/driver (dispatcher source only)
  current_city: string | null;
  ready_to_cities: string[] | null;
  ready_comment: string | null;
  load_status: string | null;
  free_payload_kg: number | null;
  free_volume_m3: number | null;
  partial_route_from: string | null;
  partial_route_to: string | null;
  loading_restrictions: string | null;
  location_updated_at: string | null;
};

const EXT_INACTIVE = new Set(["blocked", "archive", "inactive"]);
const READY_STATUSES = new Set(["ready_to_work", "available", "free"]);

export const Route = createFileRoute("/api/carrier/vehicles")({
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

        const rows: VehicleRow[] = [];
        const seenProdIds = new Set<string>();

        // (1) production vehicles
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
            });
            seenProdIds.add(v.id);
          }
        }

        // (2) dispatcher_vehicle_ext по этой же карточке
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extRes = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .select(
            "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, " +
              "height_m, home_city, ready_date, load_methods, dispatcher_status, " +
              "dispatcher_driver_ext_id, dispatcher_comment, production_vehicle_id, created_at",
          )
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .order("created_at", { ascending: false });

        const extRows = (extRes.data ?? []) as Array<{
          id: string;
          vehicle_kind: string | null;
          body_type: string | null;
          payload_kg: number | null;
          volume_m3: number | null;
          length_m: number | null;
          width_m: number | null;
          height_m: number | null;
          home_city: string | null;
          ready_date: string | null;
          load_methods: string[] | null;
          dispatcher_status: string | null;
          dispatcher_driver_ext_id: string | null;
          dispatcher_comment: string | null;
          production_vehicle_id: string | null;
        }>;

        // Подтянуть водителей одним запросом
        const driverIds = Array.from(
          new Set(extRows.map((v) => v.dispatcher_driver_ext_id).filter((x): x is string => !!x)),
        );
        const driverMap = new Map<string, { full_name: string | null; phone: string | null }>();
        if (driverIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const drvRes = await (ctx.admin.from("dispatcher_driver_ext" as never) as any)
            .select("id, full_name, phone")
            .in("id", driverIds);
          if (!drvRes.error && drvRes.data) {
            for (const d of drvRes.data as Array<{ id: string; full_name: string | null; phone: string | null }>) {
              driverMap.set(d.id, { full_name: d.full_name, phone: d.phone });
            }
          }
        }

        for (const v of extRows) {
          if (v.production_vehicle_id && seenProdIds.has(v.production_vehicle_id)) continue;
          const drv = v.dispatcher_driver_ext_id ? driverMap.get(v.dispatcher_driver_ext_id) : null;
          rows.push({
            id: v.id,
            plate_number: v.vehicle_kind ?? "—",
            brand: null,
            model: null,
            vehicle_kind: v.vehicle_kind,
            body_type: v.body_type,
            capacity_kg: v.payload_kg,
            payload_kg: v.payload_kg,
            volume_m3: v.volume_m3,
            body_length_m: v.length_m,
            body_width_m: v.width_m,
            body_height_m: v.height_m,
            home_city: v.home_city,
            ready_date: v.ready_date,
            load_methods: v.load_methods,
            dispatcher_status: v.dispatcher_status,
            has_tent: null,
            has_straps: null,
            has_manipulator: null,
            comment: v.dispatcher_comment,
            is_active: !EXT_INACTIVE.has(v.dispatcher_status ?? ""),
            driver_id: v.dispatcher_driver_ext_id,
            driver_name: drv?.full_name ?? null,
            driver_phone: drv?.phone ?? null,
            source: "dispatcher",
          });
        }

        return jsonResponse({
          ok: true,
          rows,
          total: rows.length,
          ready_statuses: Array.from(READY_STATUSES),
        });
      },
    },
  },
});
