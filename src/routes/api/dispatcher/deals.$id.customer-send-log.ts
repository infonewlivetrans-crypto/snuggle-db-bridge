import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];
const TABLE = "dispatcher_partner_card_sends";

const bodySchema = z.object({
  freight_id: z.string().uuid(),
  recipient_email: z.string().trim().min(1).max(2000),
  recipient_name: z.string().trim().max(200).nullable().optional(),
  send_channel: z.enum(["manual", "email"]).default("manual"),
  subject: z.string().trim().max(500).nullable().optional(),
  message_text: z.string().trim().min(1).max(20000),
  status: z.enum(["draft", "copied", "sent"]).default("sent"),
});

export const Route = createFileRoute(
  "/api/dispatcher/deals/$id/customer-send-log",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            { error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}` },
            { status: 400 },
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;
        const fRes = await client
          .from("dispatcher_freights")
          .select(
            "id, deal_id, assigned_carrier_ext_id, assigned_driver_ext_id, assigned_vehicle_ext_id",
          )
          .eq("id", parsed.data.freight_id)
          .maybeSingle();
        if (fRes.error)
          return jsonResponse({ error: fRes.error.message }, { status: 500 });
        if (!fRes.data)
          return jsonResponse({ error: "freight_not_found" }, { status: 404 });
        const freight = fRes.data;
        if (!freight.assigned_carrier_ext_id) {
          return jsonResponse({ error: "no_carrier_on_freight" }, { status: 409 });
        }

        const row: Record<string, unknown> = {
          dispatcher_carrier_ext_id: freight.assigned_carrier_ext_id,
          dispatcher_driver_ext_id: freight.assigned_driver_ext_id,
          dispatcher_vehicle_ext_id: freight.assigned_vehicle_ext_id,
          dispatcher_deal_id: freight.deal_id ?? params.id,
          recipient_name: parsed.data.recipient_name ?? null,
          recipient_email: parsed.data.recipient_email,
          send_channel: parsed.data.send_channel,
          subject: parsed.data.subject ?? null,
          message_text: parsed.data.message_text,
          status: parsed.data.status,
          sent_by: auth.userId,
        };
        if (parsed.data.status === "sent") row.sent_at = new Date().toISOString();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (client.from(TABLE as never) as any)
          .insert(row as unknown as never)
          .select("*")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true, row: data });
      },
    },
  },
});
