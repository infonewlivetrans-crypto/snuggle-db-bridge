import { createFileRoute } from "@tanstack/react-router";
import { hasAnyRole, jsonResponse, makeAdminClient, requireAuth, requireAdmin } from "@/server/api-helpers.server";
import { writeAudit } from "@/server/audit.server";

// Поля, которые водителю разрешено менять у заказа в рамках своей точки маршрута
// (оплата получена / тип оплаты и т.п.). RLS на orders запрещает водителю
// прямой UPDATE, поэтому для этих полей мы используем admin client после
// проверки, что заказ реально привязан к маршруту этого водителя.
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
        // RLS на orders разрешает UPDATE только admin/logist/manager. Водитель
        // через свой клиент попадёт в "0 rows updated" без ошибки — оплата
        // не сохраняется. Если все поля апдейта входят в whitelist оплаты и
        // пользователь — водитель, прикреплённый к маршруту этого заказа,
        // выполняем апдейт через admin-клиент.
        const onlyPaymentFields = Object.keys(updates).every((k) => DRIVER_PAYMENT_FIELDS.has(k));
        let client = auth.client;
        if (onlyPaymentFields) {
          const isPrivileged = await hasAnyRole(auth.client, auth.userId, ["admin", "logist", "manager"]);
          if (!isPrivileged) {
            const isDriver = await hasAnyRole(auth.client, auth.userId, ["driver"]);
            if (isDriver) {
              const admin = makeAdminClient();
              const { data: drv } = await admin
                .from("drivers")
                .select("id")
                .eq("user_id", auth.userId)
                .maybeSingle();
              const driverId = (drv as { id: string } | null)?.id ?? null;
              if (!driverId) {
                return jsonResponse({ error: "forbidden" }, { status: 403 });
              }
              const { data: rp } = await admin
                .from("route_points")
                .select("route_id, delivery_routes!inner(driver_id)")
                .eq("order_id", params.id);
              const rows = (rp ?? []) as Array<{ delivery_routes: { driver_id: string | null } | { driver_id: string | null }[] | null }>;
              const allowed = rows.some((r) => {
                const dr = r.delivery_routes;
                if (!dr) return false;
                const arr = Array.isArray(dr) ? dr : [dr];
                return arr.some((d) => d.driver_id === driverId);
              });
              if (!allowed) {
                return jsonResponse({ error: "forbidden" }, { status: 403 });
              }
              client = admin;
            }
          }
        }
        const { error } = await client
          .from("orders")
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
        const admin = makeAdminClient();

        // 1. Загружаем заказ, чтобы проверить статус/оплату и иметь label
        // для аудита.
        const { data: order, error: loadErr } = await admin
          .from("orders")
          .select(
            "id, order_number, status, payment_status, cash_received, qr_received",
          )
          .eq("id", id)
          .maybeSingle();
        if (loadErr) {
          logAdminDeleteError("[admin-delete][orders DELETE] failed", id, loadErr);
          return jsonResponse({ error: loadErr.message }, { status: 500 });
        }
        if (!order) return jsonResponse({ error: "Заказ не найден" }, { status: 404 });

        const o = order as {
          id: string;
          order_number: string;
          status: string;
          payment_status: string | null;
          cash_received: boolean;
          qr_received: boolean;
        };

        // 2. Блокирующие проверки.
        const paymentReceived =
          o.cash_received || o.qr_received || o.payment_status === "paid" || o.payment_status === "partial";
        if (paymentReceived) {
          return jsonResponse(
            { error: "Нельзя удалить заказ: по нему уже получена оплата." },
            { status: 409 },
          );
        }
        if (!ORDER_DELETABLE_STATUSES.has(o.status)) {
          return jsonResponse(
            {
              error:
                "Нельзя удалить заказ: он уже в работе или доставке. Сначала отмените заказ.",
            },
            { status: 409 },
          );
        }

        // 3. Ручная очистка order_items (FK к orders отсутствует).
        const { error: itemsErr } = await admin
          .from("order_items")
          .delete()
          .eq("order_id", id);
        if (itemsErr) {
          logAdminDeleteError("[admin-delete][orders DELETE] failed", id, itemsErr);
          return jsonResponse(
            { error: `Не удалось удалить позиции заказа: ${itemsErr.message}` },
            { status: 500 },
          );
        }

        // 4. Удаление заказа (остальные связанные таблицы — route_points,
        // client_order_messages, route_order_exclusions, notifications —
        // имеют FK ON DELETE CASCADE; route_returns.order_id — ON DELETE SET NULL).
        const { error: delErr } = await admin
          .from("orders")
          .delete()
          .eq("id", id);
        if (delErr) {
          logAdminDeleteError("[admin-delete][orders DELETE] failed", id, delErr);
          return jsonResponse(
            { error: `Не удалось удалить заказ: ${delErr.message}` },
            { status: 500 },
          );
        }

        // 5. Аудит. Не валим операцию, если запись в audit_log упала.
        try {
          const { data: prof } = await admin
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
            objectId: o.id,
            objectLabel: o.order_number,
            oldValue: {
              status: o.status,
              payment_status: o.payment_status,
              cash_received: o.cash_received,
              qr_received: o.qr_received,
            },
          });
        } catch (error) {
          logAdminDeleteError("[admin-delete][orders DELETE][audit] failed", id, error);
          // ignore
        }

        return jsonResponse({ ok: true });
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
