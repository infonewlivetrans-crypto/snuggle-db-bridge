import {
  createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/clients")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const { limit, offset, search } = parseListParams(request);

        let q = auth.client
          .from("clients" as never)
          .select("*", { count: "exact" })
          .order("name", { ascending: true });
        if (search) q = q.ilike("name", `%${search}%`);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? 0 },
          { headers: cacheHeaders(300) },
        );
      },
    },
  },
});
