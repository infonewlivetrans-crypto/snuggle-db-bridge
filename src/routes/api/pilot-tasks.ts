import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const PRIORITIES = ["critical", "important", "later"] as const;
const STATUSES = ["new", "in_progress", "review", "done"] as const;

export const Route = createFileRoute("/api/pilot-tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "director"]);
        if (auth instanceof Response) return auth;
        try {
          const url = new URL(request.url);
          const priority = url.searchParams.get("priority");
          const status = url.searchParams.get("status");
          const role = url.searchParams.get("role");
          const from = url.searchParams.get("from");
          const to = url.searchParams.get("to");

          let q = auth.client.from("pilot_tasks").select("*").order("created_at", { ascending: false }).limit(500);
          if (priority) q = q.eq("priority", priority);
          if (status) q = q.eq("status", status);
          if (role) q = q.eq("reporter_role", role);
          if (from) q = q.gte("created_at", from);
          if (to) q = q.lte("created_at", to);
          const { data: items, error } = await q;
          if (error) throw new Error(error.message);

          const all = items ?? [];
          const byStatus: Record<string, number> = { new: 0, in_progress: 0, review: 0, done: 0 };
          const byPriority: Record<string, number> = { critical: 0, important: 0, later: 0 };
          for (const t of all as Array<{ status: string; priority: string }>) {
            byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
            byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
          }
          return jsonResponse({
            items: all,
            summary: {
              total: all.length, critical: byPriority.critical ?? 0,
              inProgress: byStatus.in_progress ?? 0, done: byStatus.done ?? 0,
              new: byStatus.new ?? 0, review: byStatus.review ?? 0,
              byStatus, byPriority,
            },
          });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "director"]);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const title = String(body.title ?? "").trim();
          if (title.length < 2 || title.length > 300) return jsonResponse({ error: "Заголовок 2..300 символов" }, { status: 400 });
          const priority = String(body.priority ?? "important");
          if (!PRIORITIES.includes(priority as never)) return jsonResponse({ error: "Недопустимый приоритет" }, { status: 400 });

          const { data: prof } = await auth.client.from("profiles").select("full_name").eq("user_id", auth.userId).maybeSingle();
          const { error } = await auth.client.from("pilot_tasks").insert({
            title,
            description: (body.description as string | null) ?? null,
            what_broke: (body.whatBroke as string | null) ?? null,
            where_broke: (body.whereBroke as string | null) ?? null,
            how_to_reproduce: (body.howToReproduce as string | null) ?? null,
            priority,
            status: "new",
            assignee: (body.assignee as string | null) ?? "admin",
            route_label: (body.routeLabel as string | null) ?? null,
            source: "manual",
            reporter_user_id: auth.userId,
            reporter_name: (prof as { full_name?: string | null } | null)?.full_name ?? null,
          } as never);
          if (error) throw new Error(error.message);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "director"]);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const id = String(body.id ?? "");
          if (!id) return jsonResponse({ error: "id обязателен" }, { status: 400 });
          const patch: Record<string, unknown> = {};
          if (body.priority !== undefined) {
            if (!PRIORITIES.includes(String(body.priority) as never)) return jsonResponse({ error: "priority" }, { status: 400 });
            patch.priority = body.priority;
          }
          if (body.status !== undefined) {
            if (!STATUSES.includes(String(body.status) as never)) return jsonResponse({ error: "status" }, { status: 400 });
            patch.status = body.status;
          }
          if (body.assignee !== undefined) patch.assignee = body.assignee;
          if (body.title !== undefined) patch.title = body.title;
          if (body.description !== undefined) patch.description = body.description;
          if (body.whatBroke !== undefined) patch.what_broke = body.whatBroke;
          if (body.whereBroke !== undefined) patch.where_broke = body.whereBroke;
          if (body.howToReproduce !== undefined) patch.how_to_reproduce = body.howToReproduce;

          const { error } = await auth.client.from("pilot_tasks").update(patch as never).eq("id", id);
          if (error) throw new Error(error.message);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
