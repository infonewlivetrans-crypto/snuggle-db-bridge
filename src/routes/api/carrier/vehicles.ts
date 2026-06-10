import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET /api/carrier/vehicles — транспорт текущего перевозчика.
// Источник 1: production `vehicles` по carrier_id.
// Источник 2: `dispatcher_vehicle_ext` по dispatcher_carrier_ext_id —
//             позволяет кабинету видеть транспорт, заведённый только в
//             AI-диспетчере (ещё не синхронизированный с production).
// Только чтение, без новой бизнес-логики.

type VehicleRow = {
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
  source: "production" | "dispatcher";
};

const EXT_INACTIVE = new Set(["blocked", "archive", "inactive"]);

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
            rows.push({ ...v, source: "production" });
            seenProdIds.add(v.id);
          }
        }

        // (2) dispatcher_vehicle_ext по этой же карточке
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extRes = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .select(
            "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, " +
              "height_m, dispatcher_status, dispatcher_comment, production_vehicle_id, created_at",
          )
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .order("created_at", { ascending: false });
        if (!extRes.error && extRes.data) {
          for (const v of extRes.data as Array<{
            id: string;
            vehicle_kind: string | null;
            body_type: string | null;
            payload_kg: number | null;
            volume_m3: number | null;
            length_m: number | null;
            width_m: number | null;
            height_m: number | null;
            dispatcher_status: string | null;
            dispatcher_comment: string | null;
            production_vehicle_id: string | null;
          }>) {
            if (v.production_vehicle_id && seenProdIds.has(v.production_vehicle_id)) continue;
            rows.push({
              id: v.id,
              plate_number: v.vehicle_kind ?? "—",
              brand: null,
              model: null,
              body_type: v.body_type,
              capacity_kg: v.payload_kg,
              volume_m3: v.volume_m3,
              body_length_m: v.length_m,
              body_width_m: v.width_m,
              body_height_m: v.height_m,
              has_tent: null,
              has_straps: null,
              has_manipulator: null,
              comment: v.dispatcher_comment,
              is_active: !EXT_INACTIVE.has(v.dispatcher_status ?? ""),
              source: "dispatcher",
            });
          }
        }

        return jsonResponse({
          ok: true,
          rows,
          total: rows.length,
        });
      },
    },
  },
});
