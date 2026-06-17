import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { isLegalTransition, type TripStatus } from "@/lib/dispatcher/trip-status";

export const Route = createFileRoute("/api/driver/trips/$tripId/advance")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;
        const tripId = params.tripId;

        let body: { next?: TripStatus; pointId?: string | null };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "bad_json" }, { status: 400 });
        }
        const next = body.next;
        if (!next) return jsonResponse({ error: "missing_next" }, { status: 400 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: trip } = await (sb.from("dispatcher_trips" as never) as any)
          .select("id, status, driver_ext_id, vehicle_ext_id, deal_id, current_point_idx")
          .eq("id", tripId)
          .maybeSingle();
        if (!trip) return jsonResponse({ error: "not_found" }, { status: 404 });

        if (!isLegalTransition(trip.status as TripStatus, next)) {
          console.warn("[trip-advance] illegal transition", {
            user: auth.userId,
            trip: tripId,
            from: trip.status,
            to: next,
          });
          return jsonResponse({ error: "illegal_transition" }, { status: 400 });
        }

        const now = new Date().toISOString();

        // Update point status if pointId given.
        if (body.pointId) {
          const patch: Record<string, unknown> = {};
          if (next === "at_pickup" || next === "at_dropoff") {
            patch.status = "arrived";
            patch.arrived_at = now;
          } else if (next === "loaded" || next === "unloaded") {
            patch.status = "done";
            patch.done_at = now;
          }
          if (Object.keys(patch).length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sb.from("dispatcher_trip_points" as never) as any)
              .update(patch)
              .eq("id", body.pointId)
              .eq("trip_id", tripId);
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updErr } = await (sb.from("dispatcher_trips" as never) as any)
          .update({ status: next, updated_at: now })
          .eq("id", tripId);
        if (updErr) {
          console.error("[trip-advance] update error", updErr);
          return jsonResponse({ error: updErr.message }, { status: 500 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("dispatcher_trip_events" as never) as any).insert({
          trip_id: tripId,
          point_id: body.pointId ?? null,
          event: `status:${next}`,
          payload: { from: trip.status, to: next },
          actor_user_id: auth.userId,
        });

        // On delivered → free up the vehicle + driver
        if (next === "delivered") {
          if (trip.vehicle_ext_id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sb.from("dispatcher_vehicle_ext" as never) as any)
              .update({ dispatcher_status: "available", updated_at: now })
              .eq("id", trip.vehicle_ext_id);
          }
          if (trip.driver_ext_id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sb.from("dispatcher_driver_ext" as never) as any)
              .update({ dispatcher_status: "available" })
              .eq("id", trip.driver_ext_id);
          }
          if (trip.deal_id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sb.from("dispatcher_deals" as never) as any)
              .update({ deal_status: "delivered", delivered_at: now })
              .eq("id", trip.deal_id);
          }
        }

        return jsonResponse({ ok: true, status: next });
      },
    },
  },
});
