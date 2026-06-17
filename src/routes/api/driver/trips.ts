import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/driver/trips")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        // Find current user's driver_ext row(s) — owner-driver case may have one.
        const { data: drivers } = await sb
          .from("dispatcher_driver_ext")
          .select("id, full_name, phone")
          .eq("user_id", auth.userId);
        const driverIds = (drivers ?? []).map((d) => d.id);
        if (driverIds.length === 0) return jsonResponse({ rows: [] });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (sb.from("dispatcher_trips" as never) as any)
          .select(
            "id, status, current_point_idx, cargo_summary, weight_kg, volume_m3, body_type, rate, rate_visible_to_driver, dispatcher_contact, comment, created_at, updated_at, " +
              "vehicle_ext_id, driver_ext_id, deal_id",
          )
          .in("driver_ext_id", driverIds)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        // For each trip pull route bounds (first pickup, last dropoff) cheaply.
        const trips = (data ?? []) as Array<{ id: string }>;
        const tripIds = trips.map((t) => t.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pts } = tripIds.length
          ? await (sb.from("dispatcher_trip_points" as never) as any)
              .select("trip_id, idx, kind, city, address, status")
              .in("trip_id", tripIds)
              .order("idx", { ascending: true })
          : { data: [] };

        const pointsByTrip = new Map<string, Array<{ kind: string; city: string | null; address: string | null; status: string; idx: number }>>();
        for (const p of (pts ?? []) as Array<{ trip_id: string; kind: string; city: string | null; address: string | null; status: string; idx: number }>) {
          const list = pointsByTrip.get(p.trip_id) ?? [];
          list.push(p);
          pointsByTrip.set(p.trip_id, list);
        }

        const rows = trips.map((t) => ({
          ...t,
          points_count: pointsByTrip.get(t.id)?.length ?? 0,
          from_city:
            pointsByTrip.get(t.id)?.find((p) => p.kind === "pickup")?.city ?? null,
          to_city:
            [...(pointsByTrip.get(t.id) ?? [])].reverse().find((p) => p.kind === "dropoff")?.city ?? null,
        }));

        return jsonResponse({ rows });
      },
    },
  },
});
