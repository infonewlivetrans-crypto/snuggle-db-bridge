import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole, parseListParams } from "@/server/api-helpers.server";

const TABLE = "dispatcher_partner_card_sends";
const ALLOWED_ROLES = ["admin", "dispatcher"];
const SELECT =
  "id, dispatcher_carrier_ext_id, dispatcher_driver_ext_id, dispatcher_vehicle_ext_id, dispatcher_deal_id, " +
  "recipient_name, recipient_email, recipient_phone, recipient_messenger, send_channel, subject, message_text, " +
  "status, sent_by, sent_at, created_at, updated_at";

const SEND_CHANNELS = ["manual", "email", "whatsapp", "telegram", "max", "phone", "other"] as const;
const STATUSES = ["draft", "copied", "sent", "cancelled", "archive"] as const;

const createSchema = z.object({
  dispatcher_carrier_ext_id: z.string().uuid(),
  dispatcher_driver_ext_id: z.string().uuid().nullable().optional(),
  dispatcher_vehicle_ext_id: z.string().uuid().nullable().optional(),
  dispatcher_deal_id: z.string().uuid().nullable().optional(),
  recipient_name: z.string().trim().max(200).nullable().optional(),
  recipient_email: z.string().trim().max(200).nullable().optional(),
  recipient_phone: z.string().trim().max(50).nullable().optional(),
  recipient_messenger: z.string().trim().max(200).nullable().optional(),
  send_channel: z.enum(SEND_CHANNELS).default("manual"),
  subject: z.string().trim().max(500).nullable().optional(),
  message_text: z.string().trim().min(1).max(20000),
  status: z.enum(STATUSES).default("draft"),
});

export const Route = createFileRoute("/api/dispatcher/partner-card/sends")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const { limit, offset, url } = parseListParams(request);
        const carrierId = url.searchParams.get("carrier_id");
        const dealId = url.searchParams.get("deal_id");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any).select(SELECT, { count: "exact" });
        if (carrierId) q = q.eq("dispatcher_carrier_ext_id", carrierId);
        if (dealId) q = q.eq("dispatcher_deal_id", dealId);
        q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [], total: count ?? 0 });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            { error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}` },
            { status: 400 },
          );
        }
        const insertRow: Record<string, unknown> = { ...parsed.data, sent_by: auth.userId };
        if (parsed.data.status === "sent") insertRow.sent_at = new Date().toISOString();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .insert(insertRow as unknown as never)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data });
      },
    },
  },
});
