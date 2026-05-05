import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { importCarriers, type CarrierImportItem } from "@/server/carriers-import.server";

export const Route = createFileRoute("/api/carriers/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as { items?: CarrierImportItem[] };
          if (!body || !Array.isArray(body.items)) return jsonResponse({ error: "Ожидался список" }, { status: 400 });
          if (body.items.length === 0) return jsonResponse({ error: "Список пуст" }, { status: 400 });
          if (body.items.length > 5000) return jsonResponse({ error: "Слишком много строк (макс 5000)" }, { status: 400 });
          return jsonResponse(await importCarriers(body.items));
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});