import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const Schema = z.object({
  route_id: z.string().uuid(),
  ordered_ids: z.array(z.string().uuid()).min(1).max(500),
  changed_by: z.string().max(255).optional(),
});

export const Route = createFileRoute("/api/route-points/reorder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { route_id, ordered_ids, changed_by } = parsed.data;

        const TEMP = 100000;
        // Phase 1: assign temp values
        for (let i = 0; i < ordered_ids.length; i++) {
          const { error } = await auth.client
            .from("route_points")
            .update({ point_number: TEMP + i } as never)
            .eq("id", ordered_ids[i]);
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
        }
        // Phase 2: assign final values
        for (let i = 0; i < ordered_ids.length; i++) {
          const { error } = await auth.client
            .from("route_points")
            .update({ point_number: i + 1 } as never)
            .eq("id", ordered_ids[i]);
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
        }
        if (changed_by) {
          await auth.client
            .from("routes")
            .update({
              points_order_changed_at: new Date().toISOString(),
              points_order_changed_by: changed_by,
            } as never)
            .eq("id", route_id);
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
