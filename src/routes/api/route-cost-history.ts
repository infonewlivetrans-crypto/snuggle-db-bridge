import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/route-cost-history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const routeId = url.searchParams.get("route_id");
        if (!routeId)
          return jsonResponse({ error: "route_id required" }, { status: 400 });
        const limit = Math.min(
          Math.max(1, Number(url.searchParams.get("limit")) || 50),
          200,
        );
        const { data, error } = await auth.client
          .from("route_cost_history")
          .select(
            "id, old_cost, new_cost, old_method, new_method, changed_by, comment, created_at",
          )
          .eq("route_id", routeId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? [], { headers: cacheHeaders(15) });
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        if (typeof body.route_id !== "string")
          return jsonResponse({ error: "route_id required" }, { status: 400 });
        const payload = {
          route_id: body.route_id,
          old_cost: Number(body.old_cost) || 0,
          new_cost: Number(body.new_cost) || 0,
          old_method: (body.old_method as string | null) ?? null,
          new_method: (body.new_method as string | null) ?? null,
          changed_by: (body.changed_by as string | null) ?? null,
          comment: (body.comment as string | null) ?? null,
        };
        const { error } = await auth.client
          .from("route_cost_history")
          .insert(payload as never);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
