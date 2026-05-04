import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const Schema = z.object({
  a_id: z.string().uuid(),
  a_number: z.number().int(),
  b_id: z.string().uuid(),
  b_number: z.number().int(),
});

export const Route = createFileRoute("/api/route-points/swap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { a_id, a_number, b_id, b_number } = parsed.data;
        const tmp = -Math.abs(a_number) - 1;
        const t1 = await auth.client.from("route_points").update({ point_number: tmp } as never).eq("id", a_id);
        if (t1.error) return jsonResponse({ error: t1.error.message }, { status: 500 });
        const t2 = await auth.client.from("route_points").update({ point_number: a_number } as never).eq("id", b_id);
        if (t2.error) return jsonResponse({ error: t2.error.message }, { status: 500 });
        const t3 = await auth.client.from("route_points").update({ point_number: b_number } as never).eq("id", a_id);
        if (t3.error) return jsonResponse({ error: t3.error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
