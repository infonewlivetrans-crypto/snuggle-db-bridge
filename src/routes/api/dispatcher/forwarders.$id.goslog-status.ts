// API диспетчера: read-only статус ГосЛог экспедитора по forwarder_id.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/dispatcher/forwarders/$id/goslog-status")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (auth.client.from("forwarder_goslog_status") as any)
            .select("*")
            .eq("forwarder_id", params.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) {
            return jsonResponse({ error: "load_failed", message: error.message }, { status: 500 });
          }
          return jsonResponse({ row: data });
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
