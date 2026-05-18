import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

const InsertSchema = z.object({
  route_id: z.string().uuid(),
  from_status: z.string().max(64).nullable().optional(),
  to_status: z.string().max(64),
  changed_by: z.string().max(255),
  comment: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute("/api/transport-request-status-history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const routeId = url.searchParams.get("route_id");
        if (!routeId) return jsonResponse({ error: "route_id required" }, { status: 400 });
        const { data, error } = await auth.client
          .from("transport_request_status_history")
          .select("id, from_status, to_status, changed_by, changed_at, comment")
          .eq("route_id", routeId)
          .order("changed_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? [], { headers: cacheHeaders(10) });
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "bad_json" }, { status: 400 }); }
        const parsed = InsertSchema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { error } = await auth.client
          .from("transport_request_status_history")
          .insert(parsed.data as never);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
