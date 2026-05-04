import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const Schema = z.object({
  route_number: z.string().min(1).max(64),
  route_date: z.string().min(1).max(32),
  assigned_driver: z.string().max(255).nullable().optional(),
  assigned_vehicle: z.string().max(255).nullable().optional(),
  source_request_id: z.string().uuid(),
  status: z.string().max(32).optional(),
  comment: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute("/api/delivery-routes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { data, error } = await auth.client
          .from("delivery_routes")
          .insert(parsed.data as never)
          .select("id")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data);
      },
    },
  },
});
