import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, parseListParams, requireAnyRole } from "@/server/api-helpers.server";

const TABLE = "dispatcher_vehicle_ext";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const FREE_VEHICLE_STATUSES = [
  "available",
  "ready_to_work",
  "partially_available",
  "waiting_freight",
  "new",
  "docs_unchecked",
];
const BUSY_VEHICLE_STATUSES = [
  "blocked",
  "archive",
  "repair",
  "busy",
  "on_trip",
  "unloading",
  "inactive",
];

const SELECT =
  "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, height_m, " +
  "load_methods, home_city, current_city, ready_to_cities, ready_date, ready_comment, " +
  "dispatcher_driver_ext_id, dispatcher_carrier_ext_id, dispatcher_status, dispatcher_work_status, " +
  "dispatcher_taken_by, dispatcher_taken_at, " +
  "minimum_trip_rate, minimum_km_rate, city_rate, point_rate, rate_comment, dispatcher_comment, " +
  "docs_status, created_at, updated_at, " +
  "driver:dispatcher_driver_ext_id ( id, full_name, phone, email, whatsapp, telegram, max_messenger, city, docs_status ), " +
  "carrier:dispatcher_carrier_ext_id ( id, name, inn, phone, email, whatsapp, telegram, max_messenger, city, ati_id, ati_phone, verification_status )";

export const Route = createFileRoute("/api/dispatcher/free-vehicles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status") ?? "free"; // free | in_work | all
        const city = url.searchParams.get("city");
        const bodyType = url.searchParams.get("body_type");
        const minPayload = Number(url.searchParams.get("min_payload_kg") ?? "") || 0;
        const minVolume = Number(url.searchParams.get("min_volume_m3") ?? "") || 0;
        const readyToday = url.searchParams.get("ready_today") === "true";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any).select(SELECT, { count: "exact" });

        if (status === "free") {
          q = q
            .in("dispatcher_status", FREE_VEHICLE_STATUSES)
            .or(
              "dispatcher_work_status.is.null,dispatcher_work_status.eq.free,dispatcher_work_status.eq.released",
            );
        } else if (status === "in_work") {
          q = q.in("dispatcher_work_status", ["in_work", "offered", "accepted"]);
        } else if (status === "mine") {
          q = q
            .eq("dispatcher_taken_by", auth.userId)
            .eq("dispatcher_work_status", "in_work");
        } else if (status === "busy") {
          q = q.or(
            `dispatcher_status.in.(${BUSY_VEHICLE_STATUSES.join(",")}),dispatcher_work_status.in.(in_work,offered,accepted)`,
          );
        }
        if (city) q = q.or(`home_city.ilike.%${city}%,current_city.ilike.%${city}%`);
        if (bodyType) q = q.eq("body_type", bodyType);
        if (minPayload > 0) q = q.gte("payload_kg", minPayload);
        if (minVolume > 0) q = q.gte("volume_m3", minVolume);
        if (readyToday) {
          const today = new Date().toISOString().slice(0, 10);
          q = q.lte("ready_date", today);
        }
        if (search) {
          const s = search.replace(/[%,]/g, " ").trim();
          q = q.or(
            `vehicle_kind.ilike.%${s}%,body_type.ilike.%${s}%,home_city.ilike.%${s}%,current_city.ilike.%${s}%`,
          );
        }
        q = q.order("ready_date", { ascending: true, nullsFirst: false }).range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        // collect taken_by user ids and resolve emails/names via profiles
        const rows = (data ?? []) as Array<Record<string, unknown>>;
        const takenIds = Array.from(
          new Set(
            rows
              .map((r) => r.dispatcher_taken_by as string | null)
              .filter((v): v is string => !!v),
          ),
        );
        let profiles: Record<string, { full_name: string | null; email: string | null }> = {};
        if (takenIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: prof } = await (auth.client.from("profiles") as any)
            .select("user_id, full_name, email")
            .in("user_id", takenIds);
          for (const p of (prof ?? []) as Array<{
            user_id: string;
            full_name: string | null;
            email: string | null;
          }>) {
            profiles[p.user_id] = { full_name: p.full_name, email: p.email };
          }
        }
        const enriched = rows.map((r) => {
          const takenBy = r.dispatcher_taken_by as string | null;
          const isMine = takenBy === auth.userId;
          return {
            ...r,
            taken_by_self: isMine,
            taken_by_profile: takenBy ? (profiles[takenBy] ?? null) : null,
          };
        });

        return jsonResponse(
          { rows: enriched, total: count ?? enriched.length, user_id: auth.userId },
          { headers: cacheHeaders(0) },
        );
      },
    },
  },
});
