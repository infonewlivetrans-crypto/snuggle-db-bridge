import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/carriers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) {
          return jsonResponse([], { status: auth.status, headers: { "X-Error": "unauthorized" } });
        }
        try {
          const { limit, offset, search, url } = parseListParams(request);
          const status = url.searchParams.get("status");
          const statuses = url.searchParams.get("statuses");

          let q = auth.client
            .from("carriers")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false });
          if (status && status !== "all") q = q.eq("verification_status", status as never);
          if (statuses) {
            const arr = statuses
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (arr.length) q = q.in("verification_status", arr as never[]);
          }
          if (search) {
            q = q.or(
              `company_name.ilike.%${search}%,inn.ilike.%${search}%,city.ilike.%${search}%`,
            );
          }
          const { data, error, count } = await q.range(offset, offset + limit - 1);
          if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
          const rows = Array.isArray(data) ? data : [];
          return jsonResponse(rows, {
            headers: { ...cacheHeaders(60), "X-Total-Count": String(count ?? rows.length) },
          });
        } catch (e) {
          return jsonResponse([], { status: 500, headers: { "X-Error": (e as Error).message } });
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (!body || typeof body.company_name !== "string" || !body.company_name.trim()) {
            return jsonResponse({ error: "company_name обязателен" }, { status: 400 });
          }
          const payload = { ...body, verification_status: "new" };
          const { data, error } = await auth.client
            .from("carriers")
            .insert(payload as never)
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
