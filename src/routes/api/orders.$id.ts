import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, requireAdmin } from "@/server/api-helpers.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "@/server/audit.server";

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
  "delivery_cost_source",
  "driver_comment",
  "driver_comment_is_important",
  "manager_comment",
  "recipient_contact_time",
  "recipient_work_hours",
  "recipient_delivery_comment",
  "recipient_access_comment",
  "recipient_extra_note",
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

        // 1. Загружаем заказ, чтобы проверить статус/оплату и иметь label
        // для аудита.
        const { data: order, error: loadErr } = await supabaseAdmin
          .from("orders")
          .select(
            "id, order_number, status, payment_status, cash_received, qr_received",
          )
          .eq("id", id)
          .maybeSingle();
        if (loadErr) return jsonResponse({ error: loadErr.message }, { status: 500 });
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
        const { error: itemsErr } = await supabaseAdmin
          .from("order_items")
          .delete()
          .eq("order_id", id);
        if (itemsErr) {
          return jsonResponse(
            { error: `Не удалось удалить позиции заказа: ${itemsErr.message}` },
            { status: 500 },
          );
        }

        // 4. Удаление заказа (остальные связанные таблицы — route_points,
        // client_order_messages, route_order_exclusions, notifications —
        // имеют FK ON DELETE CASCADE; route_returns.order_id — ON DELETE SET NULL).
        const { error: delErr } = await supabaseAdmin
          .from("orders")
          .delete()
          .eq("id", id);
        if (delErr) {
          return jsonResponse(
            { error: `Не удалось удалить заказ: ${delErr.message}` },
            { status: 500 },
          );
        }

        // 5. Аудит. Не валим операцию, если запись в audit_log упала.
        try {
          const { data: prof } = await supabaseAdmin
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
        } catch {
          // ignore
        }

        return jsonResponse({ ok: true });
      },
    },
  },
});
