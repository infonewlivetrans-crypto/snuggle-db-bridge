import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

/**
 * Добавить заказ(ы) в маршрут/заявку с авто-вычислением point_number.
 * POST /api/route-points/append
 *   body: { route_id: uuid, order_ids: uuid[], status?: string }
 * Сервер находит max(point_number) и добавляет последовательно.
 */
const Schema = z.object({
  route_id: z.string().uuid(),
  order_ids: z.array(z.string().uuid()).min(1).max(500),
  status: z.string().max(32).optional(),
});

export const Route = createFileRoute("/api/route-points/append")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch {
          return jsonResponse({ error: "Некорректный JSON" }, { status: 400 });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { route_id, order_ids, status } = parsed.data;

        const sb = auth.client;
        const { data: maxRow, error: maxErr } = await sb
          .from("route_points")
          .select("point_number")
          .eq("route_id", route_id)
          .order("point_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxErr) return jsonResponse({ error: maxErr.message }, { status: 500 });
        const base = ((maxRow as { point_number: number } | null)?.point_number ?? 0);

        const rows = order_ids.map((order_id, idx) => ({
          route_id,
          order_id,
          point_number: base + 1 + idx,
          ...(status ? { status } : {}),
        }));
        const { error } = await sb.from("route_points").insert(rows as never);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true, inserted: rows.length });
      },
    },
  },
});
