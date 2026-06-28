// API диспетчера: связать карточку экспедитора с записью ГосЛог по ИНН.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { linkGoslogToForwarder, describeGoslogLink } from "@/server/edo/dispatcher-forwarders.server";

export const Route = createFileRoute("/api/dispatcher/forwarders-ext/$id/link-goslog")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const info = await describeGoslogLink(auth.client, params.id);
          return jsonResponse({ info });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const info = await linkGoslogToForwarder(auth.client, params.id);
          return jsonResponse({ info });
        } catch (e) {
          return jsonResponse(
            { error: "link_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
