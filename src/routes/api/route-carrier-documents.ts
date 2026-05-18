import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

const InsertSchema = z.object({
  route_id: z.string().uuid(),
  carrier_id: z.string().uuid().nullable().optional(),
  kind: z.string().min(1).max(64),
  file_url: z.string().min(1).max(2048),
  comment: z.string().max(2000).nullable().optional(),
  uploaded_by: z.string().uuid().nullable().optional(),
  uploaded_by_label: z.string().max(255).nullable().optional(),
});

export const Route = createFileRoute("/api/route-carrier-documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const routeId = url.searchParams.get("route_id");
        if (!routeId) return jsonResponse({ error: "route_id required" }, { status: 400 });
        const { data, error } = await auth.client
          .from("route_carrier_documents")
          .select("*")
          .eq("route_id", routeId)
          .order("created_at", { ascending: false });
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
        const { data, error } = await auth.client
          .from("route_carrier_documents")
          .insert(parsed.data as never)
          .select("*")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data);
      },
    },
  },
});
