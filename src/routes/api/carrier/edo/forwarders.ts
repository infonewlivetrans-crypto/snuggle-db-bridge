// API: безопасный поиск экспедиторов для carrier-контекста.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { searchForwardersForCarrier } from "@/server/edo/forwarders-public.server";

export const Route = createFileRoute("/api/carrier/edo/forwarders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").trim();
        try {
          const rows = await searchForwardersForCarrier(auth.client, q);
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
