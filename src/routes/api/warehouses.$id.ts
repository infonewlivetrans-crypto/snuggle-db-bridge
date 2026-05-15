import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/warehouses/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return jsonResponse({ error: "bad_body" }, { status: 400 });
        const { error } = await auth.client
          .from("warehouses")
          .update(body as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ ok: true });
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        // Блокирующие проверки связей перед удалением.
        const id = params.id;
        const checks = await Promise.all([
          auth.client.from("routes").select("id", { count: "exact", head: true }).eq("warehouse_id", id),
          (auth.client as unknown as { from: (t: string) => { select: (c: string, o: { count: "exact"; head: true }) => { eq: (k: string, v: string) => Promise<{ count: number | null }> } } })
            .from("stock_balances")
            .select("product_id", { count: "exact", head: true })
            .eq("warehouse_id", id),
          auth.client.from("products").select("id", { count: "exact", head: true }).eq("warehouse_id", id),
        ]);
        const labels = ["маршруты", "остатки", "товары"] as const;
        const blockers = checks
          .map((r, i) => ({ count: (r as { count: number | null }).count ?? 0, label: labels[i] }))
          .filter((b) => b.count > 0);
        if (blockers.length > 0) {
          return jsonResponse(
            {
              error: `Нельзя удалить склад: к нему привязаны ${blockers
                .map((b) => `${b.label} (${b.count})`)
                .join(", ")}. Сделайте склад неактивным — он останется в истории, но не будет предлагаться в новых заявках.`,
            },
            { status: 409 },
          );
        }
        const { error } = await auth.client
          .from("warehouses")
          .delete()
          .eq("id", id);
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
