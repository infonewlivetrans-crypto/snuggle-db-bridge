import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, parseListParams, requireAdmin } from "@/server/api-helpers.server";
import { createManager, listManagers } from "@/server/managers.server";

export const Route = createFileRoute("/api/managers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) {
          return jsonResponse([], { status: auth.status, headers: { "X-Error": "unauthorized" } });
        }
        try {
          const { limit, offset, search } = parseListParams(request);
          const all = await listManagers(auth.client);
          const filtered = search
            ? all.filter((m) =>
                [m.full_name, m.phone, m.comment]
                  .filter(Boolean)
                  .some((v) => String(v).toLowerCase().includes(search.toLowerCase())),
              )
            : all;
          const rows = filtered.slice(offset, offset + limit);
          return jsonResponse(rows, {
            headers: { ...cacheHeaders(60), "X-Total-Count": String(filtered.length) },
          });
        } catch (e) {
          return jsonResponse([], { status: 500, headers: { "X-Error": (e as Error).message } });
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as { fullName?: string; phone?: string | null; comment?: string | null };
          if (!body?.fullName?.trim()) return jsonResponse({ error: "Укажите ФИО" }, { status: 400 });
          const row = await createManager({
            fullName: body.fullName.trim(),
            phone: body.phone ?? null,
            comment: body.comment ?? null,
            createdBy: auth.userId,
          });
          return jsonResponse(row);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});