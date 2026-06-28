// API: безопасная карточка экспедитора для carrier-контекста (с ГосЛог).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { getForwarderForCarrier } from "@/server/edo/forwarders-public.server";

export const Route = createFileRoute("/api/carrier/edo/forwarders/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const card = await getForwarderForCarrier(auth.client, params.id);
          if (!card) return jsonResponse({ error: "not_found" }, { status: 404 });
          return jsonResponse(card);
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
