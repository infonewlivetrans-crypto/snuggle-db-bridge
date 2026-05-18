import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RpcResult = {
  ok: boolean;
  code?: string;
  message?: string;
  deletedOrders?: Array<{ id: string; orderNumber: string | null }>;
  errors?: Array<{ id: string; orderNumber: string | null; reason: string }>;
  deletedRoutes?: Array<{ id: string; routeNumber: string | null }>;
  deletedDeliveryRoutes?: Array<{ id: string; routeNumber: string | null }>;
  blockedRoutes?: Array<{ routeId: string; routeNumber: string | null; reason: string }>;
};

export const Route = createFileRoute("/api/orders/bulk-delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;

        let body: { ids?: unknown } = {};
        try {
          body = (await request.json()) as { ids?: unknown };
        } catch {
          return jsonResponse({ error: "Некорректный JSON" }, { status: 400 });
        }
        if (!Array.isArray(body.ids) || body.ids.length === 0) {
          return jsonResponse(
            { error: "Не передан список заказов" },
            { status: 400 },
          );
        }
        if (body.ids.length > 500) {
          return jsonResponse(
            { error: "Не более 500 заказов за один запрос" },
            { status: 400 },
          );
        }
        const ids = (body.ids as unknown[]).filter(
          (v): v is string => typeof v === "string" && UUID_RE.test(v),
        );
        if (ids.length === 0) {
          return jsonResponse(
            { error: "Список заказов пуст или некорректен" },
            { status: 400 },
          );
        }

        const { data, error } = await auth.client.rpc(
          "admin_bulk_delete_orders" as never,
          { p_order_ids: ids } as never,
        );
        if (error) {
          console.error("[orders.bulk-delete] rpc failed:", error);
          return jsonResponse(
            { error: error.message ?? "Ошибка удаления" },
            { status: 500 },
          );
        }
        const r = (data ?? {}) as RpcResult;
        if (!r.ok) {
          return jsonResponse(
            { error: r.message ?? r.code ?? "Удаление отклонено" },
            { status: r.code === "forbidden" ? 403 : 400 },
          );
        }
        return jsonResponse({
          ok: true,
          deletedOrders: r.deletedOrders ?? [],
          errors: r.errors ?? [],
          deletedRoutes: r.deletedRoutes ?? [],
          deletedDeliveryRoutes: r.deletedDeliveryRoutes ?? [],
          blockedRoutes: r.blockedRoutes ?? [],
        });
      },
    },
  },
});
