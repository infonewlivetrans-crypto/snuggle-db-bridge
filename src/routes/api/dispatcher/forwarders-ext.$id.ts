// API диспетчера: одна запись экспедитора (read/update/soft-archive).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  getForwarderExt, updateForwarderExt, archiveForwarderExt,
} from "@/server/edo/dispatcher-forwarders.server";

export const Route = createFileRoute("/api/dispatcher/forwarders-ext/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const row = await getForwarderExt(auth.client, params.id);
          if (!row) return jsonResponse({ error: "not_found" }, { status: 404 });
          return jsonResponse({ row });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          const row = await updateForwarderExt(auth.client, params.id, body);
          return jsonResponse({ row });
        } catch (e) {
          return jsonResponse(
            { error: "update_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          await archiveForwarderExt(auth.client, params.id);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse(
            { error: "archive_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
