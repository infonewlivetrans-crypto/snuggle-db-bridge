import {
  createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  requireAuth,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/delivery-documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const routeId = url.searchParams.get("route_id");
        if (!routeId)
          return jsonResponse({ error: "route_id required" }, { status: 400 });

        const { data, error } = await auth.client
          .from("route_carrier_documents")
          .select(
            "id, route_id, carrier_id, kind, file_url, comment, uploaded_by_label, created_at",
          )
          .eq("route_id", routeId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [] },
          { headers: cacheHeaders(180) },
        );
      },
    },
  },
});
