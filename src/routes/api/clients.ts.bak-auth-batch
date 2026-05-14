import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  parseListParams,
  requireUser,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/clients")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

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
