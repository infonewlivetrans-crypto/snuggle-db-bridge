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
        if (!token) return jsonResponse([], { status: 401, headers: { "X-Error": "unauthorized" } });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse([], { status: 401, headers: { "X-Error": "unauthorized" } });

        const { limit, offset, search, url } = parseListParams(request);
        const carrierId = url.searchParams.get("carrierId");
        const activeOnly = url.searchParams.get("activeOnly") === "1";

        let q = auth.client
          .from("drivers")
          .select("*", { count: "exact" })
          .order("full_name", { ascending: true });
        if (carrierId) q = q.eq("carrier_id", carrierId);
        if (activeOnly) q = q.eq("is_active", true);
        if (search) {
          q = q.or(
            `full_name.ilike.%${search}%,phone.ilike.%${search}%,license_number.ilike.%${search}%`,
          );
        }

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        const rows = Array.isArray(data) ? data : [];
        return jsonResponse(rows, {
          headers: { ...cacheHeaders(300), "X-Total-Count": String(count ?? rows.length) },
        });
      },
    },
  },
});
