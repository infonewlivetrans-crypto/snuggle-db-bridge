import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { taskUpdateSchema } from "@/lib/dispatcher/schemas";
import { SELECT } from "./tasks";

const TABLE = "dispatcher_tasks";
const ALLOWED_ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/tasks/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .select(SELECT)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = taskUpdateSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            {
              error: `validation_failed: ${first?.path?.join(".") || "?"} — ${first?.message ?? ""}`,
              issues: parsed.error.issues,
            },
            { status: 400 },
          );
        }
        const patch: Record<string, unknown> = { ...parsed.data };
        if (patch.task_status === "done" && !patch.completed_at) {
          patch.completed_at = new Date().toISOString();
        }
        if (patch.task_status && patch.task_status !== "done") {
          patch.completed_at = null;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update(patch as unknown as never)
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // soft-cancel
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (auth.client.from(TABLE as never) as any)
          .update({ task_status: "cancelled" } as unknown as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
