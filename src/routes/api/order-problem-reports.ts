import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const Schema = z.object({
  order_id: z.string().uuid(),
  route_point_id: z.string().uuid().nullable().optional(),
  route_id: z.string().uuid().nullable().optional(),
  reason: z.string().min(1).max(255),
  comment: z.string().max(4000).nullable().optional(),
  photo_url: z.string().max(2000).nullable().optional(),
  urgency: z.enum(["normal", "urgent"]).default("normal"),
  reported_by: z.string().max(255).nullable().optional(),
  manager_name: z.string().max(255).nullable().optional(),
  manager_phone: z.string().max(64).nullable().optional(),
});

export const Route = createFileRoute("/api/order-problem-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { error } = await (
          auth.client.from("order_problem_reports" as never) as unknown as {
            insert: (p: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
          }
        ).insert(parsed.data);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
