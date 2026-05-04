import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, parseListParams, requireAdmin } from "@/server/api-helpers.server";
import { listManagers } from "@/server/managers.server";

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
          const all = await listManagers();
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
    },
  },
});