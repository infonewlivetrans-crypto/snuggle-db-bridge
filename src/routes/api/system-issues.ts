import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

/**
 * Зафиксированные проблемы системы.
 * GET /api/system-issues?status_neq=done&limit=20[&fields=*]
 * POST /api/system-issues  body: {title, description?, location?, role, severity, status, comment?}
 * PATCH /api/system-issues?id=...  body: partial
 * DELETE /api/system-issues?id=...
 */
export const Route = createFileRoute("/api/system-issues")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const statusNeq = url.searchParams.get("status_neq");
        const status = url.searchParams.get("status");
        const fields =
          url.searchParams.get("fields") ||
          "id, title, severity, status, role, location, created_at";
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 500);

        let q = auth.client
          .from("system_issues" as never)
          .select(fields)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (statusNeq) q = q.neq("status", statusNeq as never);
        if (status) q = q.eq("status", status as never);

        const { data, error } = await q;
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        return jsonResponse(data ?? [], { headers: cacheHeaders(20) });
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        if (typeof body.title !== "string" || !body.title.trim())
          return jsonResponse({ error: "title required" }, { status: 400 });
        const { data, error } = await (
          auth.client.from("system_issues" as never) as unknown as {
            insert: (p: Record<string, unknown>) => {
              select: (s: string) => {
                single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
              };
            };
          }
        ).insert(body).select("id").single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ id: data?.id ?? null });
      },
      PATCH: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "id required" }, { status: 400 });
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const { error } = await (
          auth.client.from("system_issues" as never) as unknown as {
            update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
          }
        ).update(body).eq("id", id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
      DELETE: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "id required" }, { status: 400 });
        const { error } = await (
          auth.client.from("system_issues" as never) as unknown as {
            delete: () => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
          }
        ).delete().eq("id", id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
