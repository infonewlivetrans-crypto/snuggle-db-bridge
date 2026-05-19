// Server-only helper for inserting notifications.
// Уведомления никогда не должны вставляться через browser Supabase REST
// или через runtime `supa.from("notifications")` в *.functions.ts.
// Любой server-side код, которому нужно создать уведомление, должен
// вызывать `insertNotification(...)`.
import { makeAdminClient } from "@/server/api-helpers.server";

const supabaseAdmin = makeAdminClient();

export interface NotificationRow {
  kind: string;
  title: string;
  body?: string | null;
  order_id?: string | null;
  route_id?: string | null;
  payload?: Record<string, unknown> | null;
}

export async function insertNotification(row: NotificationRow): Promise<void> {
  const { error } = await (
    supabaseAdmin.from("notifications") as unknown as {
      insert: (r: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    }
  ).insert({
    kind: row.kind,
    title: row.title,
    body: row.body ?? null,
    order_id: row.order_id ?? null,
    route_id: row.route_id ?? null,
    payload: row.payload ?? {},
  });
  if (error) {
    // не пробрасываем — уведомление не должно ронять основной поток
    console.error("[notifications.server] insert error:", error.message);
  }
}
