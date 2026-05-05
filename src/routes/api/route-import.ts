import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { importRouteRowsServer, type RouteImportRow } from "@/server/route-import.server";

export const Route = createFileRoute("/api/route-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: { rows: RouteImportRow[] };
        try { body = await request.json(); }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        if (!body?.rows || !Array.isArray(body.rows))
          return jsonResponse({ error: "Нужен массив rows" }, { status: 400 });
        try {
          const result = await importRouteRowsServer(auth.client, body.rows);
          return jsonResponse(result);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
