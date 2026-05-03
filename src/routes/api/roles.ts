import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAdmin } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/roles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("user_roles")
          .select("user_id, role");
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [] },
          { headers: cacheHeaders(60) },
        );
      },
    },
  },
});
