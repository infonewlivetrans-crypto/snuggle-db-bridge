import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  parseListParams,
  requireUser,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/vehicles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const { limit, offset, search, url } = parseListParams(request);
        const carrierId = url.searchParams.get("carrierId");
        const bodyType = url.searchParams.get("bodyType");
        const activeOnly = url.searchParams.get("activeOnly") === "1";

        let q = auth.client
          .from("vehicles")
          .select("*", { count: "exact" })
          .order("plate_number", { ascending: true });
        if (carrierId) q = q.eq("carrier_id", carrierId);
        if (bodyType && bodyType !== "all") q = q.eq("body_type", bodyType);
        if (activeOnly) q = q.eq("is_active", true);
        if (search) {
          q = q.or(
            `plate_number.ilike.%${search}%,brand.ilike.%${search}%,model.ilike.%${search}%`,
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
