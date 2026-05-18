import { createFileRoute } from "@tanstack/react-router";
import {
  jsonResponse,
  requireAuth,
  requireAdmin,
  cacheHeaders,
} from "@/server/api-helpers.server";
import { writeAudit } from "@/server/audit.server";

const ALLOWED = new Set([
  "status",
  "comment",
  "points_order_changed_at",
  "points_order_changed_by",
  // request_status flow
  "request_status",
  "request_status_changed_by",
  "request_status_changed_at",
  "request_status_comment",
  // carrier payment
  "carrier_payment_status",
  "carrier_cost_comment",
  "carrier_cost_approved_at",
  // carrier payout
  "carrier_payout_status",
  "carrier_payout_scheduled_date",
  "carrier_payout_paid_amount",
  "carrier_payout_paid_at",
  "carrier_payout_comment",
  "carrier_payout_changed_at",
  "carrier_payout_changed_by",
  // carrier docs
  "carrier_docs_status",
  "carrier_docs_comment",
  "carrier_docs_uploaded_at",
  "carrier_docs_uploaded_by",
  "carrier_docs_accepted_at",
  "carrier_docs_accepted_by",
  "carrier_docs_fix_reason",
  // warehouses
  "warehouse_id",
  "destination_warehouse_id",
  // scheduling
  "route_date",
  "departure_time",
  "request_priority",
  // transport requirements
  "required_body_type",
  "required_capacity_kg",
  "required_volume_m3",
  "required_body_length_m",
  "requires_tent",
  "requires_manipulator",
  "requires_straps",
  // timing / eta
  "avg_speed_kmh",
  "default_service_minutes",
  "planned_departure_at",
  // cost / tariff
  "cost_method",
  "cost_per_km",
  "cost_per_point",
  "fixed_cost",
  "delivery_cost",
  "manual_cost",
  "applied_tariff_id",
  "manual_cost_reason",
  "manual_orders_amount",
  "delivery_percent_target",
]);

type DeleteRouteResult = {
  ok?: boolean;
  code?: string;
  message?: string;
  error?: string;
  route_number?: string;
  status?: string;
  request_status?: string;
};

const DELETE_STATUS_BY_CODE: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  not_deletable_status: 409,
  has_active_delivery_routes: 409,
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

export const Route = createFileRoute("/api/routes/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("routes")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const r = data as Record<string, unknown> & {
          warehouse_id?: string | null;
          destination_warehouse_id?: string | null;
          vehicle_id?: string | null;
          driver_id?: string | null;
          carrier_id?: string | null;
        };
        const [wh, dwh, veh, drv, car] = await Promise.all([
          r.warehouse_id
            ? auth.client.from("warehouses").select("id, name, city, address").eq("id", r.warehouse_id).maybeSingle()
            : Promise.resolve({ data: null }),
          r.destination_warehouse_id
            ? auth.client.from("warehouses").select("id, name, city, address").eq("id", r.destination_warehouse_id).maybeSingle()
            : Promise.resolve({ data: null }),
          r.vehicle_id
            ? auth.client
                .from("vehicles")
                .select("id, plate_number, brand, model, body_type, capacity_kg, volume_m3")
                .eq("id", r.vehicle_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          r.driver_id
            ? auth.client.from("drivers").select("id, full_name, phone").eq("id", r.driver_id).maybeSingle()
            : Promise.resolve({ data: null }),
          r.carrier_id
            ? auth.client.from("carriers").select("id, company_name").eq("id", r.carrier_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        return jsonResponse(
          {
            ...r,
            warehouse: wh.data ?? null,
            // Алиас, который ожидает фронт detail-страницы:
            source_warehouse: wh.data ?? null,
            destination_warehouse: dwh.data ?? null,
            vehicle: veh.data ?? null,
            driver: drv.data ?? null,
            carrier: car.data ?? null,
          },
          { headers: cacheHeaders(30) },
        );
      },

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
        const { error } = await auth.client.from("routes").update(updates as never).eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },

      DELETE: async ({ request, params }) => {
        const id = params.id;
        try {
          const auth = await requireAdmin(request);
          if (auth instanceof Response) return auth;

          // Вся проверка доступа и каскадное удаление выполняются внутри
          // SECURITY DEFINER RPC `admin_delete_route` в Lovable Cloud backend.
          // Вызов идёт через user-scoped клиент (auth.client), service_role
          // на VPS больше не требуется.
          const { data, error } = await auth.client.rpc(
            "admin_delete_route",
            { p_route_id: id },
          );
          if (error) {
            logAdminDeleteError("[admin-delete][routes DELETE] failed", id, error);
            return jsonResponse({ error: error.message }, { status: 500 });
          }

          const result = (data ?? {}) as DeleteRouteResult;
          if (!result.ok) {
            const status = DELETE_STATUS_BY_CODE[result.code ?? ""] ?? 500;
            return jsonResponse(
              { error: result.message ?? result.error ?? "Не удалось удалить заявку" },
              { status },
            );
          }

          // Аудит (best-effort, ошибки не валят запрос).
          try {
            const { data: prof } = await auth.client
              .from("profiles")
              .select("full_name")
              .eq("user_id", auth.userId)
              .maybeSingle();
            await writeAudit({
              userId: auth.userId,
              userName: (prof as { full_name?: string | null } | null)?.full_name ?? null,
              userRole: "admin",
              section: "routes",
              action: "delete",
              objectType: "route",
              objectId: id,
              objectLabel: result.route_number ?? id,
              oldValue: {
                status: result.status ?? null,
                request_status: result.request_status ?? null,
              },
            });
          } catch (auditError) {
            logAdminDeleteError("[admin-delete][routes DELETE][audit] failed", id, auditError);
          }

          return jsonResponse({ ok: true });
        } catch (error) {
          logAdminDeleteError("[admin-delete][routes DELETE] failed", id, error);
          return jsonResponse(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
