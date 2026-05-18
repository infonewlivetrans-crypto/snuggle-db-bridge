import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, requireAdmin } from "@/server/api-helpers.server";

const ALLOWED = new Set([
  "status",
  "comment",
  "assigned_driver",
  "assigned_vehicle",
  "driver_id",
  "carrier_id",
  "driver_access_token",
  "driver_access_created_at",
  "driver_access_created_by",
  "driver_access_enabled",
]);

type DeleteDeliveryRouteResult = {
  ok?: boolean;
  code?: string;
  message?: string;
  error?: string;
};

const DELETE_STATUS_BY_CODE: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  not_deletable_status: 409,
  stage_started: 409,
};

function logAdminDeleteError(marker: string, id: string, error: unknown) {
  console.error(marker, {
    id,
    name: error instanceof Error ? error.name : undefined,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    raw: error,
  });
}

export const Route = createFileRoute("/api/delivery-routes/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body)) {
          if (ALLOWED.has(k)) updates[k] = v;
        }
        if (Object.keys(updates).length === 0) {
          return jsonResponse({ error: "Нет допустимых полей" }, { status: 400 });
        }
        const { error } = await auth.client
          .from("delivery_routes")
          .update(updates as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },

      DELETE: async ({ request, params }) => {
        const id = params.id;
        try {
          const auth = await requireAdmin(request);
          if (auth instanceof Response) return auth;

          const { data, error } = await auth.client.rpc(
            "admin_delete_delivery_route",
            { p_route_id: id },
          );
          if (error) {
            logAdminDeleteError("[admin-delete][delivery-routes DELETE] failed", id, error);
            return jsonResponse({ error: error.message }, { status: 500 });
          }

          const result = (data ?? {}) as DeleteDeliveryRouteResult;
          if (!result.ok) {
            const status = DELETE_STATUS_BY_CODE[result.code ?? ""] ?? 500;
            return jsonResponse(
              { error: result.message ?? result.error ?? "Не удалось удалить рейс" },
              { status },
            );
          }

          return jsonResponse({ ok: true });
        } catch (error) {
          logAdminDeleteError("[admin-delete][delivery-routes DELETE] failed", id, error);
          return jsonResponse(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
