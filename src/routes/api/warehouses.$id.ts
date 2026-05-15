import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/warehouses/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return jsonResponse({ error: "bad_body" }, { status: 400 });
        const { error } = await auth.client
          .from("warehouses")
          .update(body as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ ok: true });
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { error } = await auth.client
          .from("warehouses")
          .delete()
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
