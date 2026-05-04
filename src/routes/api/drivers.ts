import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/drivers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) {
          return jsonResponse([], { status: auth.status, headers: { "X-Error": "unauthorized" } });
        }
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
          headers: { ...cacheHeaders(60), "X-Total-Count": String(count ?? rows.length) },
        });
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (!body || typeof body.full_name !== "string" || !body.full_name.trim()) {
            return jsonResponse({ error: "full_name обязателен" }, { status: 400 });
          }
          if (typeof body.carrier_id !== "string" || !body.carrier_id) {
            return jsonResponse({ error: "carrier_id обязателен" }, { status: 400 });
          }
          const { data, error } = await auth.client
            .from("drivers")
            .insert(body as never)
            .select("*")
            .single();
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          return jsonResponse(data);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
