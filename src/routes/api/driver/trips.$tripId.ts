import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/driver/trips/$tripId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;
        const tripId = params.tripId;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: trip, error } = await (sb.from("dispatcher_trips" as never) as any)
          .select("*")
          .eq("id", tripId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!trip) return jsonResponse({ error: "not_found" }, { status: 404 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: points } = await (sb.from("dispatcher_trip_points" as never) as any)
          .select("*")
          .eq("trip_id", tripId)
          .order("idx", { ascending: true });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: events } = await (sb.from("dispatcher_trip_events" as never) as any)
          .select("id, event, payload, at, actor_user_id, point_id")
          .eq("trip_id", tripId)
          .order("at", { ascending: false })
          .limit(50);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: documents } = await (sb.from("dispatcher_trip_documents" as never) as any)
          .select("id, kind, storage_path, required, point_id, created_at")
          .eq("trip_id", tripId)
          .order("created_at", { ascending: false });

        return jsonResponse({
          trip,
          points: points ?? [],
          events: events ?? [],
          documents: documents ?? [],
        });
      },
    },
  },
});
