import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/import-logs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response)
          return jsonResponse([], { status: auth.status });
        const { data, error } = await auth.client
          .from("import_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error)
          return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        return jsonResponse(data ?? []);
      },
    },
  },
});
