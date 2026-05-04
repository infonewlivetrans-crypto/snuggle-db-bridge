import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/drivers/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("drivers")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data);
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const patch = (await request.json()) as Record<string, unknown>;
          const { data, error } = await auth.client
            .from("drivers")
            .update(patch as never)
            .eq("id", params.id)
            .select("*")
            .maybeSingle();
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          return jsonResponse(data);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { error } = await auth.client.from("drivers").delete().eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
