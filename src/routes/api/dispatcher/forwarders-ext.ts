// API диспетчера: список и создание экспедиторов (dispatcher_forwarder_ext).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole, parseListParams } from "@/server/api-helpers.server";
import {
  listForwarderExt, createForwarderExt,
  type ForwarderExtStatus,
} from "@/server/edo/dispatcher-forwarders.server";

export const Route = createFileRoute("/api/dispatcher/forwarders-ext")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        const { url, search } = parseListParams(request);
        const status = (url.searchParams.get("status") ?? "all") as ForwarderExtStatus | "all";
        const includeArchived = url.searchParams.get("includeArchived") === "1";
        try {
          const rows = await listForwarderExt(auth.client, { search, status, includeArchived });
          return jsonResponse({ rows });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          const row = await createForwarderExt(auth.client, auth.userId, body);
          return jsonResponse({ row }, { status: 201 });
        } catch (e) {
          return jsonResponse(
            { error: "create_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
