import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/warehouses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const { limit, offset, search, url } = parseListParams(request);
        const activeOnly = url.searchParams.get("activeOnly") === "1";

        let q = auth.client
          .from("warehouses")
          .select("*", { count: "exact" })
          .order("is_active", { ascending: false })
          .order("name", { ascending: true });
        if (activeOnly) q = q.eq("is_active", true);
        if (search) q = q.ilike("name", `%${search}%`);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? 0 },
          { headers: cacheHeaders(60) },
        );
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || typeof body.name !== "string" || !body.name.trim())
          return jsonResponse({ error: "name_required" }, { status: 400 });
        const { data, error } = await auth.client
          .from("warehouses")
          .insert(body as never)
          .select("*")
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ row: data });
      },
    },
  },
});
