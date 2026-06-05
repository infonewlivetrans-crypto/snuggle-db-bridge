import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAnyRole,
} from "@/server/api-helpers.server";
import { taskCreateSchema } from "@/lib/dispatcher/schemas";
import {
  RELATED_ENTITY_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
} from "@/lib/dispatcher/statuses";

const TABLE = "dispatcher_tasks";
const ALLOWED_ROLES = ["admin", "dispatcher"];

export const SELECT =
  "id, task_type, title, description, priority, task_status, " +
  "due_date, due_at, related_entity_type, related_entity_id, " +
  "dispatcher_carrier_ext_id, dispatcher_driver_ext_id, dispatcher_vehicle_ext_id, " +
  "dispatcher_freight_id, dispatcher_deal_id, " +
  "action_url, completed_at, created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const priority = url.searchParams.get("priority");
        const taskType = url.searchParams.get("task_type");
        const dueDate = url.searchParams.get("due_date");
        const relatedType = url.searchParams.get("related_entity_type");
        const overdue = url.searchParams.get("overdue");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any)
          .select(SELECT, { count: "exact" });

        if (
          status &&
          status !== "all" &&
          (TASK_STATUSES as readonly string[]).includes(status)
        ) {
          q = q.eq("task_status", status);
        }
        if (
          priority &&
          priority !== "all" &&
          (TASK_PRIORITIES as readonly string[]).includes(priority)
        ) {
          q = q.eq("priority", priority);
        }
        if (
          taskType &&
          taskType !== "all" &&
          (TASK_TYPES as readonly string[]).includes(taskType)
        ) {
          q = q.eq("task_type", taskType);
        }
        if (
          relatedType &&
          relatedType !== "all" &&
          (RELATED_ENTITY_TYPES as readonly string[]).includes(relatedType)
        ) {
          q = q.eq("related_entity_type", relatedType);
        }
        if (dueDate) q = q.eq("due_date", dueDate);
        if (overdue === "1") {
          const today = new Date().toISOString().slice(0, 10);
          q = q.lt("due_date", today).in("task_status", ["open", "in_progress"]);
        }
        if (search) {
          const s = search.replace(/[%,]/g, " ").trim();
          q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
        }
        q = q
          .order("priority", { ascending: false })
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? (data ?? []).length },
          { headers: cacheHeaders(0) },
        );
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = taskCreateSchema.safeParse(body);
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
        const payload = { ...parsed.data, created_by: auth.userId };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .insert(payload as unknown as never)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data }, { status: 201 });
      },
    },
  },
});
