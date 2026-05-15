import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const Body = z.object({
  delivery_route_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  product_id: z.string().uuid().nullable(),
  nomenclature: z.string().min(1).max(500),
  unit: z.string().max(64).nullable().optional(),
  qty: z.number().positive(),
  route_number: z.string().max(64).nullable().optional(),
});

// POST /api/dock-loading/confirm
// Подтверждение загрузки одной позиции:
// - проверка остатка с учётом собственного резерва заявки;
// - запись dock_loaded_items;
// - stock_movements 'shipment' (qty < 0);
// - списание активных резервов под исходную заявку (consumed/частично qty),
//   агрегированная запись stock_movements 'reservation_consume'.
export const Route = createFileRoute("/api/dock-loading/confirm")({
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

        // Найти исходную заявку (для учёта резервов)
        let sourceRequestId: string | null = null;
        if (args.product_id) {
          const { data: dr } = await sb
            .from("delivery_routes")
            .select("source_request_id")
            .eq("id", args.delivery_route_id)
            .maybeSingle();
          sourceRequestId =
            (dr as { source_request_id?: string | null } | null)
              ?.source_request_id ?? null;

          // Доступно реально = available + собственный активный резерв заявки
          const { data: bal } = await sb
            .from("stock_balances")
            .select("available")
            .eq("warehouse_id", args.warehouse_id)
            .eq("product_id", args.product_id)
            .maybeSingle();
          const av = Number(
            (bal as { available?: number } | null)?.available ?? 0,
          );

          let ownReserved = 0;
          if (sourceRequestId) {
            const { data: rs } = await sb
              .from("stock_reservations")
              .select("qty")
              .eq("transport_request_id", sourceRequestId)
              .eq("product_id", args.product_id)
              .eq("warehouse_id", args.warehouse_id)
              .eq("status", "active");
            const list = (rs ?? []) as Array<{ qty: number }>;
            ownReserved = list.reduce((s, r) => s + (Number(r.qty) || 0), 0);
          }

          if (av + ownReserved < args.qty) {
            return jsonResponse(
              { error: "Недостаточно товара для загрузки" },
              { status: 409 },
            );
          }
        }

        // 1) запись в журнале загрузки
        const { error: e1 } = await sb.from("dock_loaded_items").insert({
          delivery_route_id: args.delivery_route_id,
          warehouse_id: args.warehouse_id,
          product_id: args.product_id,
          nomenclature: args.nomenclature,
          unit: args.unit ?? null,
          qty_loaded: args.qty,
        } as never);
        if (e1) return jsonResponse({ error: e1.message }, { status: 500 });

        // 2) движение «отгрузка»
        if (args.product_id) {
          const moveComment = args.route_number
            ? `Загрузка по маршруту ${args.route_number}: ${args.nomenclature}`
            : `Загрузка: ${args.nomenclature}`;
          const { error: e2 } = await sb.from("stock_movements").insert({
            warehouse_id: args.warehouse_id,
            product_id: args.product_id,
            movement_type: "shipment",
            qty: -args.qty,
            reason: "shipment_loaded",
            ref_route_id: args.delivery_route_id,
            comment: moveComment,
          } as never);
          if (e2) return jsonResponse({ error: e2.message }, { status: 500 });

          // 3) списание активных резервов
          if (sourceRequestId) {
            const { data: actives } = await sb
              .from("stock_reservations")
              .select("id, qty")
              .eq("transport_request_id", sourceRequestId)
              .eq("product_id", args.product_id)
              .eq("warehouse_id", args.warehouse_id)
              .eq("status", "active");
            const list = (actives ?? []) as Array<{ id: string; qty: number }>;
            let toConsume = args.qty;
            let consumedTotal = 0;
            for (const r of list) {
              if (toConsume <= 0) break;
              const q = Number(r.qty) || 0;
              const take = Math.min(q, toConsume);
              const remain = q - take;
              if (remain <= 0) {
                await sb
                  .from("stock_reservations")
                  .update({ status: "consumed" } as never)
                  .eq("id", r.id);
              } else {
                await sb
                  .from("stock_reservations")
                  .update({ qty: remain } as never)
                  .eq("id", r.id);
              }
              toConsume -= take;
              consumedTotal += take;
            }
            if (consumedTotal > 0) {
              const c2 = args.route_number
                ? `Списание резерва при загрузке (маршрут ${args.route_number}): ${args.nomenclature}`
                : `Списание резерва при загрузке: ${args.nomenclature}`;
              await sb.from("stock_movements").insert({
                warehouse_id: args.warehouse_id,
                product_id: args.product_id,
                movement_type: "reservation_consume",
                qty: consumedTotal,
                reason: "reservation_consumed_on_load",
                ref_route_id: args.delivery_route_id,
                ref_transport_request_id: sourceRequestId,
                comment: c2,
              } as never);
            }
          }
        }

        return jsonResponse({ ok: true });
      },
    },
  },
});
