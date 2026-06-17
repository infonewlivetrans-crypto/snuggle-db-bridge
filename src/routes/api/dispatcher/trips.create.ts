import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];

type PointInput = {
  kind: "pickup" | "dropoff" | "waypoint";
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  scheduled_at?: string | null;
  comment?: string | null;
};

export const Route = createFileRoute("/api/dispatcher/trips/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        let body: {
          deal_id?: string | null;
          carrier_ext_id?: string | null;
          vehicle_ext_id: string;
          driver_ext_id: string;
          cargo_summary?: string;
          weight_kg?: number;
          volume_m3?: number;
          body_type?: string;
          rate?: number;
          rate_visible_to_driver?: boolean;
          dispatcher_contact?: string;
          comment?: string;
          points: PointInput[];
        };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "bad_json" }, { status: 400 });
        }
        if (!body.vehicle_ext_id || !body.driver_ext_id || !Array.isArray(body.points) || body.points.length === 0) {
          return jsonResponse({ error: "missing_fields" }, { status: 400 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: trip, error } = await (sb.from("dispatcher_trips" as never) as any)
          .insert({
            deal_id: body.deal_id ?? null,
            carrier_ext_id: body.carrier_ext_id ?? null,
            vehicle_ext_id: body.vehicle_ext_id,
            driver_ext_id: body.driver_ext_id,
            cargo_summary: body.cargo_summary ?? null,
            weight_kg: body.weight_kg ?? null,
            volume_m3: body.volume_m3 ?? null,
            body_type: body.body_type ?? null,
            rate: body.rate ?? null,
            rate_visible_to_driver: Boolean(body.rate_visible_to_driver),
            dispatcher_contact: body.dispatcher_contact ?? null,
            comment: body.comment ?? null,
            created_by: auth.userId,
            status: "assigned",
          })
          .select("id")
          .maybeSingle();
        if (error || !trip) {
          console.error("[trips/create] error", error);
          return jsonResponse({ error: error?.message ?? "insert_failed" }, { status: 500 });
        }

        const pointsRows = body.points.map((p, idx) => ({
          trip_id: trip.id as string,
          idx,
          kind: p.kind,
          city: p.city ?? null,
          address: p.address ?? null,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
          contact_name: p.contact_name ?? null,
          contact_phone: p.contact_phone ?? null,
          scheduled_at: p.scheduled_at ?? null,
          comment: p.comment ?? null,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: pErr } = await (sb.from("dispatcher_trip_points" as never) as any).insert(pointsRows);
        if (pErr) {
          console.error("[trips/create] points insert error", pErr);
          return jsonResponse({ error: pErr.message }, { status: 500 });
        }

        return jsonResponse({ trip_id: trip.id });
      },
    },
  },
});
