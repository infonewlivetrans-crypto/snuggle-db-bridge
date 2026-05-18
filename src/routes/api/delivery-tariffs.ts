import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAdmin, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/delivery-tariffs")({
  server: {
    handlers: {
      // GET доступен всем авторизованным — тарифы нужны логисту в карточке маршрута.
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const warehouseId = url.searchParams.get("warehouse_id");
        let q = auth.client
          .from("delivery_tariffs")
          .select("*")
          .order("priority", { ascending: true })
          .order("created_at", { ascending: false });
        if (warehouseId && warehouseId !== "all") q = q.eq("warehouse_id", warehouseId);
        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [], total: (data ?? []).length }, { headers: cacheHeaders(30) });
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const { error, data } = await auth.client
          .from("delivery_tariffs")
          .insert(body as never)
          .select("*")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data);
      },
    },
  },
});
