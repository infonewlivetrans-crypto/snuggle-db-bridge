// API: статус ГосЛог экспедиторов (список + upsert).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { listGoslog, upsertGoslog } from "@/server/edo/goslog.server";

export const Route = createFileRoute("/api/forwarder/goslog-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const rows = await listGoslog(auth.client);
          return jsonResponse({ rows });
        } catch (e) {
          return jsonResponse({ error: "load_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          const row = await upsertGoslog(auth.client, auth.userId, body);
          return jsonResponse({ row });
        } catch (e) {
          return jsonResponse({ error: "save_failed", message: e instanceof Error ? e.message : String(e) }, { status: 400 });
        }
      },
    },
  },
});
