import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const TABLE = "dispatcher_vehicle_ext";
const ALLOWED_ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/vehicles/$id/release-work")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: current, error: readErr } = await (auth.client.from(TABLE as never) as any)
          .select("id, dispatcher_taken_by")
          .eq("id", params.id)
          .maybeSingle();
        if (readErr) return jsonResponse({ error: readErr.message }, { status: 500 });
        if (!current) return jsonResponse({ error: "not_found" }, { status: 404 });

        const takenBy = current.dispatcher_taken_by as string | null;
        // Allow admins/owner to release. Non-owner dispatcher cannot release.
        // Simple check: only the owner can release here.
        if (takenBy && takenBy !== auth.userId) {
          // Admin override: allow if has admin role (re-check)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: roles } = await (auth.client.from("user_roles") as any)
            .select("role")
            .eq("user_id", auth.userId)
            .eq("role", "admin")
            .maybeSingle();
          if (!roles) {
            return jsonResponse(
              { error: "forbidden", message: "Освободить может только тот диспетчер, который взял машину" },
              { status: 403 },
            );
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update({
            dispatcher_taken_by: null,
            dispatcher_taken_at: null,
            dispatcher_work_status: "released",
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
