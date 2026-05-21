import { createFileRoute } from "@tanstack/react-router";
import { hasAnyRole, jsonResponse, makeAdminClient, requireAuth, requireAdmin } from "@/server/api-helpers.server";
import { writeAudit } from "@/server/audit.server";

// Поля, которые водителю разрешено менять у заказа в рамках своей точки маршрута.
// Сохранение этих полей идёт через SECURITY DEFINER RPC с проверкой водителя в БД.
const DRIVER_PAYMENT_FIELDS = new Set<string>([
  "cash_received",
  "qr_received",
  "payment_status",
]);

const ALLOWED_FIELDS = new Set<string>([
  "status",
  "payment_status",
  "cash_received",
  "qr_received",
  "amount_due",
  "marketplace",
  "client_works_weekends",
  "delivery_window_from",
  "delivery_window_to",
  "client_type",
  "delivery_time_comment",
  "delivery_cost",
  "delivery_cost_source",
  "manual_cost_reason",
  "manual_cost_set_by",
  "driver_comment",
  "driver_comment_is_important",
  "manager_comment",
  "recipient_contact_time",
  "recipient_work_hours",
  "recipient_delivery_comment",
  "recipient_access_comment",
  "recipient_extra_note",
  "delivery_address",
  "contact_name",
  "contact_phone",
  "comment",
]);

// Поля, для которых на сервере действует ограничение в 2000 символов
// (разовая информация по заказу / комментарий менеджера).
const TEXT_FIELDS_MAX_2000 = new Set<string>([
  "manager_comment",
  "recipient_contact_time",
  "recipient_work_hours",
  "recipient_delivery_comment",
  "recipient_access_comment",
  "recipient_extra_note",
]);

// Статусы, при которых заказ считается уже в работе / доставке /
// завершён — удаление запрещено. Только "новый", "отменён" и
// "исключён из маршрута" допускают админ-удаление.
const ORDER_DELETABLE_STATUSES = new Set<string>([
  "new",
  "cancelled",
  "excluded_from_route",
]);

function logAdminDeleteError(marker: string, id: string, error: unknown) {
  console.error(marker, {
    id,
    name: error instanceof Error ? error.name : undefined,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    raw: error,
  });
}

export const Route = createFileRoute("/api/orders/$id")({
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
          if (!ALLOWED_FIELDS.has(k)) continue;
          if (TEXT_FIELDS_MAX_2000.has(k)) {
            if (v === null || v === undefined || v === "") {
              updates[k] = null;
              continue;
            }
            if (typeof v !== "string") {
              return jsonResponse({ error: `Поле ${k} должно быть строкой` }, { status: 400 });
            }
            if (v.length > 2000) {
              return jsonResponse(
                { error: `Поле ${k} не должно превышать 2000 символов` },
                { status: 400 },
              );
            }
            updates[k] = v;
            continue;
          }
          updates[k] = v;
        }
        if (Object.keys(updates).length === 0) {
          return jsonResponse({ error: "Нет допустимых полей для обновления" }, { status: 400 });
        }
        // RLS на orders разрешает UPDATE только admin/logist/manager. Для driver-only
        // payment update используем SECURITY DEFINER RPC: она сама проверяет, что
        // auth.uid() — водитель маршрута, где находится этот заказ.
        const onlyPaymentFields = Object.keys(updates).every((k) => DRIVER_PAYMENT_FIELDS.has(k));
        if (onlyPaymentFields) {
          const isPrivileged = await hasAnyRole(auth.client, auth.userId, ["admin", "logist", "manager"]);
          if (!isPrivileged) {
            const isDriver = await hasAnyRole(auth.client, auth.userId, ["driver"]);
            if (!isDriver) return jsonResponse({ error: "forbidden" }, { status: 403 });
            const cashVal = "cash_received" in updates ? (updates.cash_received as boolean | null) : null;
            const qrVal = "qr_received" in updates ? (updates.qr_received as boolean | null) : null;
            const psVal = "payment_status" in updates ? (updates.payment_status as string | null) : null;
            const { data: rpcData, error: rpcError } = await auth.client.rpc(
              "driver_update_order_payment" as never,
              {
                p_order_id: params.id,
                p_cash_received: cashVal,
                p_qr_received: qrVal,
                p_payment_status: psVal,
              } as never,
            );
            if (rpcError) {
              const msg = rpcError.message || "";
              const isForbidden = /forbidden|unauthorized|permission/i.test(msg);
              return jsonResponse(
                { error: isForbidden ? "forbidden" : msg },
                { status: isForbidden ? 403 : 500 },
              );
            }
            const rows = (rpcData ?? []) as Array<{
              id: string;
              cash_received: boolean;
              qr_received: boolean;
              payment_status: string;
            }>;
            return jsonResponse({ ok: true, order: rows[0] ?? null });
          }
        }
        const { error } = await auth.client
          .from("orders")
          .update(updates as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        const id = params.id;
        try {
          const { data, error } = await auth.client.rpc(
            "admin_delete_order" as never,
            { p_order_id: id } as never,
          );
          if (error) {
            logAdminDeleteError("[admin-delete][orders DELETE] RPC failed", id, error);
            const msg = error.message || String(error);
            const isForbidden = /forbidden|unauthorized|permission/i.test(msg);
            const isConflict = /нельзя|оплат|работ|достав|status|conflict|не найден/i.test(msg);
            return jsonResponse(
              { error: msg },
              { status: isForbidden ? 403 : isConflict ? 409 : 500 },
            );
          }

          // Best-effort аудит — не валим операцию, если запись упала.
          try {
            const result = (data ?? {}) as { order_number?: string | null };
            const { data: prof } = await auth.client
              .from("profiles")
              .select("full_name")
              .eq("user_id", auth.userId)
              .maybeSingle();
            await writeAudit({
              userId: auth.userId,
              userName: (prof as { full_name?: string | null } | null)?.full_name ?? null,
              userRole: "admin",
              section: "orders",
              action: "delete",
              objectType: "order",
              objectId: id,
              objectLabel: result.order_number ?? id,
            });
          } catch (auditError) {
            logAdminDeleteError("[admin-delete][orders DELETE][audit] failed", id, auditError);
          }

          return jsonResponse({ ok: true, result: data });
        } catch (error) {
          logAdminDeleteError("[admin-delete][orders DELETE] failed", id, error);
          return jsonResponse(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
