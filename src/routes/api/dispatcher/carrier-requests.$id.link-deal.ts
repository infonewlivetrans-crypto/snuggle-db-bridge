import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { z } from "zod";

const ALLOWED_ROLES = ["admin", "dispatcher"];

const bodySchema = z.object({ deal_id: z.string().uuid() });

export const Route = createFileRoute("/api/dispatcher/carrier-requests/$id/link-deal")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success)
          return jsonResponse({ error: "validation_failed: deal_id" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;
        const deal = await client
          .from("dispatcher_deals")
          .select("id, deal_number")
          .eq("id", parsed.data.deal_id)
          .maybeSingle();
        if (!deal.data) return jsonResponse({ error: "deal_not_found" }, { status: 404 });

        const upd = await client
          .from("dispatcher_carrier_requests")
          .update({ dispatcher_deal_id: parsed.data.deal_id } as never)
          .eq("id", params.id)
          .select("id, dispatcher_deal_id")
          .single();
        if (upd.error) return jsonResponse({ error: upd.error.message }, { status: 500 });
        return jsonResponse({ row: upd.data, deal: deal.data });
      },
    },
  },
});
