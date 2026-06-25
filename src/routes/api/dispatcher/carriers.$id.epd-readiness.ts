// API диспетчера: read-only готовность перевозчика к ЭПД.
// Доступ контролируется RLS (admin / dispatcher).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/dispatcher/carriers/$id/epd-readiness")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (auth.client.from("carrier_epd_readiness") as any)
            .select("*")
            .eq("carrier_ext_id", params.id)
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
