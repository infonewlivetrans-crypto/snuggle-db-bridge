import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

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
    },
  },
});
