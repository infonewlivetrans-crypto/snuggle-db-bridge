import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// Список грузов, назначенных текущему перевозчику, по которым нужны действия:
// получение/просмотр документов от заказчика, загрузка подписанного PDF.

export const Route = createFileRoute("/api/carrier/freights/signing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) {
          return jsonResponse({ ok: false, reason: "no_carrier_linked", rows: [] });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.admin.from("dispatcher_freights" as never) as any)
          .select(
            "id, title, loading_city, unloading_city, loading_date, unloading_date, " +
              "cargo_name, rate, dispatcher_status, signed_sent_at, signed_sent_channel",
          )
          .eq("assigned_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .in("dispatcher_status", [
            "docs_received",
            "carrier_signing",
            "signed_sent",
            "deal_created",
            "waiting_docs",
          ])
          .order("updated_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true, rows: data ?? [] });
      },
    },
  },
});
