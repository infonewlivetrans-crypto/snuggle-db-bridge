import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";
import { patchByIdHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/supply-requests/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("supply_requests")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data }, { headers: cacheHeaders(10) });
      },
      PATCH: patchByIdHandler("supply_requests"),
    },
  },
});
