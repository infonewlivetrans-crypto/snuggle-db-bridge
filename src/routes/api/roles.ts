import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAdmin } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/roles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) {
          return jsonResponse([], { status: auth.status, headers: { "X-Error": "unauthorized" } });
        }
        const { data, error } = await auth.client
          .from("user_roles")
          .select("user_id, role");
        if (error) {
          return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        }
        const rows = Array.isArray(data) ? data : [];
        return jsonResponse(rows, { headers: cacheHeaders(60) });
      },
    },
  },
});
