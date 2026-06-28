// API диспетчера: создать заготовку записи ГосЛог по данным экспедитора.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { createGoslogStatusFromForwarder } from "@/server/edo/dispatcher-forwarders.server";

export const Route = createFileRoute("/api/dispatcher/forwarders-ext/$id/create-goslog-status")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        try {
          const info = await createGoslogStatusFromForwarder(auth.client, auth.userId, params.id);
          return jsonResponse({ info });
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
