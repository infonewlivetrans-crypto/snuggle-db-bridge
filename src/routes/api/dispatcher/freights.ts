import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

// Каркас. Полноценный CRUD появится на этапе 3.
export const Route = createFileRoute("/api/dispatcher/freights")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("dispatcher_freights")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [], total: data?.length ?? 0 });
      },
    },
  },
});
