import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin, requireAnyRole } from "@/server/api-helpers.server";
import { listErrors, updateErrorStatus } from "@/server/system-errors.server";

export const Route = createFileRoute("/api/system-errors")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "director"]);
        if (auth instanceof Response) return auth;
        try {
          const url = new URL(request.url);
          const filters = {
            status: url.searchParams.get("status"),
            severity: url.searchParams.get("severity"),
            section: url.searchParams.get("section"),
            from: url.searchParams.get("from"),
            to: url.searchParams.get("to"),
            limit: Math.min(Math.max(1, Number(url.searchParams.get("limit")) || 500), 2000),
          };
          const rows = await listErrors(filters);
          return jsonResponse(rows);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as { id?: string; status?: "new" | "in_progress" | "resolved"; note?: string | null };
          if (!body?.id) return jsonResponse({ error: "id обязателен" }, { status: 400 });
          if (!body.status || !["new", "in_progress", "resolved"].includes(body.status)) {
            return jsonResponse({ error: "Недопустимый статус" }, { status: 400 });
          }
          await updateErrorStatus(body.id, body.status, body.note ?? null, auth.userId);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
