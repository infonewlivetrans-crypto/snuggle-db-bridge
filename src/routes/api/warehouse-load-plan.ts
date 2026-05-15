import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/warehouse-load-plan")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const pointIdsParam = url.searchParams.get("route_point_ids");
        const ids = pointIdsParam
          ? pointIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
        if (ids.length === 0) return jsonResponse([], { headers: cacheHeaders(10) });
        const { data, error } = await (auth.client as never as { from: (t: string) => any })
          .from("warehouse_load_plan")
          .select("*")
          .in("route_point_id", ids);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? [], { headers: cacheHeaders(10) });
      },
      POST: async ({ request }) => {
        // upsert by route_point_id
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || !body.route_point_id) return jsonResponse({ error: "bad_body" }, { status: 400 });
        const c = (auth.client as never as { from: (t: string) => any });
        const { data: existing } = await c
          .from("warehouse_load_plan")
          .select("id")
          .eq("route_point_id", body.route_point_id)
          .maybeSingle();
        if (existing && (existing as { id: string }).id) {
          const patch: Record<string, unknown> = { ...body };
          delete patch.route_point_id;
          const { error } = await c
            .from("warehouse_load_plan")
            .update(patch)
            .eq("id", (existing as { id: string }).id);
          if (error) return jsonResponse({ error: error.message }, { status: 400 });
        } else {
          const { error } = await c.from("warehouse_load_plan").insert(body);
          if (error) return jsonResponse({ error: error.message }, { status: 400 });
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
