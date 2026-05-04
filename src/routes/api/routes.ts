import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  parseListParams,
  requireUser,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/routes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse([], { status: 401, headers: { "X-Error": "unauthorized" } });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse([], { status: 401, headers: { "X-Error": "unauthorized" } });

        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const activeOnly = url.searchParams.get("activeOnly") === "1";

        let q = auth.client
          .from("routes")
          .select("*, route_points(eta_at, eta_risk)", { count: "exact" })
          .order("route_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (activeOnly) q = q.in("status", ["planned", "in_progress"]);
        else if (status && status !== "all") q = q.eq("status", status as never);
        if (search) q = q.ilike("route_number", `%${search}%`);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        const rows = Array.isArray(data) ? data : [];
        return jsonResponse(rows, {
          headers: { ...cacheHeaders(60), "X-Total-Count": String(count ?? rows.length) },
        });
      },
    },
  },
});
