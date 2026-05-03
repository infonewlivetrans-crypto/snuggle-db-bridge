import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  parseListParams,
  requireUser,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/drivers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const { limit, offset, search, url } = parseListParams(request);
        const carrierId = url.searchParams.get("carrierId");

        let q = auth.client
          .from("drivers")
          .select("*", { count: "exact" })
          .order("full_name", { ascending: true });
        if (carrierId) q = q.eq("carrier_id", carrierId);
        if (search) {
          q = q.or(
            `full_name.ilike.%${search}%,phone.ilike.%${search}%,license_number.ilike.%${search}%`,
          );
        }

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
