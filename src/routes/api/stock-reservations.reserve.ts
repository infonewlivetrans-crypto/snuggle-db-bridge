import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const Body = z.object({
  request_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  product_id: z.string().uuid(),
  qty: z.number().positive(),
  nomenclature: z.string().min(1).max(500),
  route_number: z.string().max(64).nullable().optional(),
});

// POST /api/stock-reservations/reserve
// Атомарно: проверка остатка + insert stock_reservations + insert stock_movements (reserve)
export const Route = createFileRoute("/api/stock-reservations/reserve")({
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

        const { data: bal, error: be } = await sb
          .from("stock_balances")
          .select("available")
          .eq("warehouse_id", args.warehouse_id)
          .eq("product_id", args.product_id)
          .maybeSingle();
        if (be) return jsonResponse({ error: be.message }, { status: 500 });
        const available = Number((bal as { available?: number } | null)?.available ?? 0);
        if (available < args.qty) {
          return jsonResponse(
            { error: "Нельзя зарезервировать товар: недостаточно остатка" },
            { status: 409 },
          );
        }

        const comment = args.route_number
          ? `Резерв под заявку ${args.route_number}`
          : "Резерв под заявку на транспорт";

        const { error: re } = await sb.from("stock_reservations").insert({
          product_id: args.product_id,
          warehouse_id: args.warehouse_id,
          qty: args.qty,
          status: "active",
          transport_request_id: args.request_id,
          comment,
          created_by: "Логист",
        } as never);
        if (re) return jsonResponse({ error: re.message }, { status: 500 });

        const moveComment = args.route_number
          ? `Резерв под заявку ${args.route_number}: ${args.nomenclature}`
          : `Резерв: ${args.nomenclature}`;

        const { error: me } = await sb.from("stock_movements").insert({
          product_id: args.product_id,
          warehouse_id: args.warehouse_id,
          movement_type: "reserve",
          qty: args.qty,
          reason: "reservation_created",
          ref_route_id: args.request_id,
          ref_transport_request_id: args.request_id,
          comment: moveComment,
          created_by: "Логист",
        } as never);
        if (me) return jsonResponse({ error: me.message }, { status: 500 });

        return jsonResponse({ ok: true });
      },
    },
  },
});
