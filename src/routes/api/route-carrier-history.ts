import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const Schema = z.object({
  route_id: z.string().uuid(),
  carrier_id: z.string().uuid().nullable().optional(),
  action: z.string().min(1).max(64),
  actor_user_id: z.string().uuid().nullable().optional(),
  actor_label: z.string().max(255).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  reason: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute("/api/route-carrier-history")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "bad_json" }, { status: 400 }); }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { error } = await auth.client
          .from("route_carrier_history")
          .insert(parsed.data as never);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
