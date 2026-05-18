import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const { limit, offset, url } = parseListParams(request);
        const orderId = url.searchParams.get("order_id");
        const kind = url.searchParams.get("kind");
        const fields =
          url.searchParams.get("fields") ||
          "id, kind, title, body, order_id, payload, is_read, created_at";

        let q = auth.client
          .from("notifications")
          .select(fields, { count: "exact" })
          .order("created_at", { ascending: false });
        if (orderId) q = q.eq("order_id", orderId);
        if (kind) q = q.eq("kind", kind);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? 0 },
          { headers: cacheHeaders(30) },
        );
      },
      // Создание уведомления (например, риск опоздания к клиенту).
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        if (typeof body.kind !== "string" || !body.kind.trim())
          return jsonResponse({ error: "kind required" }, { status: 400 });
        const { error } = await auth.client
          .from("notifications")
          .insert(body as never);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
      // Bulk mark-read: { ids?: string[], kind?: string, is_read: true }
      PATCH: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => ({}))) as {
          ids?: string[];
          kind?: string;
          is_read?: boolean;
        };
        const isRead = body.is_read !== false;
        const patch: Record<string, unknown> = {
          is_read: isRead,
          read_at: isRead ? new Date().toISOString() : null,
        };
        let q = auth.client.from("notifications").update(patch as never);
        if (Array.isArray(body.ids) && body.ids.length > 0) {
          q = q.in("id", body.ids);
        } else if (body.kind) {
          q = q.eq("kind", body.kind).eq("is_read", !isRead);
        } else {
          return jsonResponse({ error: "ids or kind required" }, { status: 400 });
        }
        const { error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
