import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/inbound-documents/$id/ignore")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (auth.client.from("dispatcher_inbound_documents") as any)
          .update({ processing_status: "ignored" })
          .eq("id", params.id);
        if (res.error) return jsonResponse({ error: res.error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
