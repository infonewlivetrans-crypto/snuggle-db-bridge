import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const TABLE = "dispatcher_vehicle_ext";
const ALLOWED_ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/vehicles/$id/take-work")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: current, error: readErr } = await (auth.client.from(TABLE as never) as any)
          .select("id, dispatcher_taken_by, dispatcher_taken_at, dispatcher_work_status")
          .eq("id", params.id)
          .maybeSingle();
        if (readErr) return jsonResponse({ error: readErr.message }, { status: 500 });
        if (!current) return jsonResponse({ error: "not_found" }, { status: 404 });

        const takenBy = current.dispatcher_taken_by as string | null;
        const workStatus = current.dispatcher_work_status as string | null;

        if (takenBy && takenBy !== auth.userId && workStatus && workStatus !== "free" && workStatus !== "released") {
          console.warn("[dispatcher.take-work] vehicle_taken_by_other", {
            vehicle_id: params.id,
            requester: auth.userId,
            taken_by: takenBy,
            work_status: workStatus,
          });
          return jsonResponse(
            {
              error: "already_taken",
              message: "Машина уже в работе у другого диспетчера",
              taken_by: takenBy,
              taken_at: current.dispatcher_taken_at,
            },
            { status: 409 },
          );
        }

        if (takenBy === auth.userId && workStatus === "in_work") {
          return jsonResponse({ ok: true, row: current });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update({
            dispatcher_taken_by: auth.userId,
            dispatcher_taken_at: new Date().toISOString(),
            dispatcher_work_status: "in_work",
          } as unknown as never)
          .eq("id", params.id)
          .select("id, dispatcher_taken_by, dispatcher_taken_at, dispatcher_work_status")
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true, row: data });
      },
    },
  },
});
