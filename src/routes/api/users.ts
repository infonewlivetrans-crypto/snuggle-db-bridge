import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { adminListUsers } from "@/server/users.server";

export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) {
          // Сохраняем контракт массива в теле даже при ошибке авторизации.
          return jsonResponse([], { status: auth.status, headers: { "X-Error": "unauthorized" } });
        }
        try {
          const url = new URL(request.url);
          const limit = Math.min(
            Math.max(1, Number(url.searchParams.get("limit")) || 20),
            100,
          );
          const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
          const all = await adminListUsers();
          const arr = Array.isArray(all) ? all : [];
          const rows = arr.slice(offset, offset + limit);
          return jsonResponse(rows, {
            headers: { ...cacheHeaders(60), "X-Total-Count": String(arr.length) },
          });
        } catch (e) {
          return jsonResponse([], {
            status: 500,
            headers: { "X-Error": (e as Error).message },
          });
        }
      },
    },
  },
});
