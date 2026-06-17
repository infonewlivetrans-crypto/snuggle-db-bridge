// /api/inbound-signatures/assets/:id — PATCH (is_active), DELETE
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/inbound-signatures/assets/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: { is_active?: boolean } = {};
        try { body = await request.json(); } catch { /* ignore */ }
        const sb = auth.client;

        if (typeof body.is_active === "boolean") {
          // Если активируем — деактивируем все остальные у того же carrier_ext_id.
          if (body.is_active) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const row: any = await sb
              .from("carrier_signature_assets")
              .select("carrier_ext_id")
              .eq("id", params.id)
              .maybeSingle();
            const cExt = row.data?.carrier_ext_id;
            if (cExt) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (sb.from("carrier_signature_assets") as any)
                .update({ is_active: false })
                .eq("carrier_ext_id", cExt);
            }
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const upd = await (sb.from("carrier_signature_assets") as any)
            .update({ is_active: body.is_active })
            .eq("id", params.id);
          if (upd.error) return jsonResponse({ error: upd.error.message }, { status: 500 });
        }
        return jsonResponse({ ok: true });
      },
      DELETE: async ({ params }) => {
        const auth = await requireAuth(new Request("https://x")); // not used — auth via cookie inside requireAuth
        if (auth instanceof Response) return auth;
        const sb = auth.client;
        const del = await sb.from("carrier_signature_assets").delete().eq("id", params.id);
        if (del.error) return jsonResponse({ error: del.error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
