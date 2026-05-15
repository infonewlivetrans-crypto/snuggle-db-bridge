import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

const SUPPLY_KINDS = [
  "supply_alert",
  "stock_low",
  "stock_out",
  "stock_overflow",
  "stock_error",
];

export const Route = createFileRoute("/api/supply-notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const onlyUnread = url.searchParams.get("unread") === "1";
        const limit = Math.min(
          Math.max(1, Number(url.searchParams.get("limit")) || 200),
          500,
        );

        let q = auth.client
          .from("notifications")
          .select("id, kind, title, body, payload, read_at, created_at")
          .in("kind", SUPPLY_KINDS as never[])
          .order("created_at", { ascending: false })
          .limit(limit);
        if (onlyUnread) q = q.is("read_at", null);
        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [] },
          { headers: cacheHeaders(15) },
        );
      },
      POST: async ({ request }) => {
        // mark-read endpoint: body { ids?: string[]; id?: string }
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => null)) as
          | { ids?: string[]; id?: string }
          | null;
        if (!body) return jsonResponse({ error: "bad_body" }, { status: 400 });
        const ids = Array.isArray(body.ids)
          ? body.ids
          : body.id
            ? [body.id]
            : [];
        if (ids.length === 0) return jsonResponse({ ok: true });
        const { error } = await auth.client
          .from("notifications")
          .update({ read_at: new Date().toISOString() } as never)
          .in("id", ids)
          .in("kind", SUPPLY_KINDS as never[]);
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
