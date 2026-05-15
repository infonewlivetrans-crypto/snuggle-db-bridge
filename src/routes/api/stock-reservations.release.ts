import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const Body = z.object({
  request_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  // Если product_id передан — снимаем резервы только по этому продукту,
  // иначе — снимаем все активные резервы по заявке.
  product_id: z.string().uuid().nullable().optional(),
  nomenclature: z.string().max(500).nullable().optional(),
  route_number: z.string().max(64).nullable().optional(),
});

// POST /api/stock-reservations/release
// Атомарно: получить активные резервы → status='released' → stock_movements (reservation_release)
// агрегированно по product_id.
export const Route = createFileRoute("/api/stock-reservations/release")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse({ error: "Некорректный JSON" }, { status: 400 });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return jsonResponse({ error: parsed.error.message }, { status: 400 });
        }
        const args = parsed.data;
        const sb = auth.client;

        let q = sb
          .from("stock_reservations")
          .select("id, product_id, qty")
          .eq("transport_request_id", args.request_id)
          .eq("status", "active");
        if (args.product_id) q = q.eq("product_id", args.product_id);
        const { data: active, error: qe } = await q;
        if (qe) return jsonResponse({ error: qe.message }, { status: 500 });
        const list = (active ?? []) as Array<{
          id: string;
          product_id: string;
          qty: number;
        }>;
        if (list.length === 0) return jsonResponse({ ok: true, released: 0 });

        const ids = list.map((r) => r.id);
        const { error: ue } = await sb
          .from("stock_reservations")
          .update({ status: "released" } as never)
          .in("id", ids);
        if (ue) return jsonResponse({ error: ue.message }, { status: 500 });

        const byProduct = new Map<string, number>();
        for (const r of list) {
          byProduct.set(
            r.product_id,
            (byProduct.get(r.product_id) ?? 0) + (Number(r.qty) || 0),
          );
        }

        for (const [pid, total] of byProduct) {
          const nomenc = args.nomenclature ?? "";
          const comment = args.route_number
            ? `Снятие резерва (заявка ${args.route_number})${nomenc ? ": " + nomenc : ""}`
            : `Снятие резерва${nomenc ? ": " + nomenc : ""}`;
          const { error: me } = await sb.from("stock_movements").insert({
            product_id: pid,
            warehouse_id: args.warehouse_id,
            movement_type: "reservation_release",
            qty: total,
            reason: "reservation_released",
            ref_route_id: args.request_id,
            ref_transport_request_id: args.request_id,
            comment,
            created_by: "Логист",
          } as never);
          if (me) return jsonResponse({ error: me.message }, { status: 500 });
        }

        return jsonResponse({ ok: true, released: list.length });
      },
    },
  },
});
