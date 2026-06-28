// API диспетчера: список ЭПД-документов/сценариев конкретного экспедитора.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { listForwarderEpdDocuments } from "@/server/edo/dispatcher-forwarders.server";

export const Route = createFileRoute("/api/dispatcher/forwarders-ext/$id/epd-documents")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const rows = await listForwarderEpdDocuments(auth.client, params.id);
          return jsonResponse({ rows });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
