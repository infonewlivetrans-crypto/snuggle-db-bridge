import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { SELECT } from "./tasks";

const TABLE = "dispatcher_tasks";
const ALLOWED_ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/tasks/$id/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update({
            task_status: "done",
            completed_at: new Date().toISOString(),
          } as unknown as never)
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },
    },
  },
});
