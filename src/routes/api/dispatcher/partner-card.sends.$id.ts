import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const TABLE = "dispatcher_partner_card_sends";
const ALLOWED_ROLES = ["admin", "dispatcher"];
const SELECT =
  "id, dispatcher_carrier_ext_id, dispatcher_driver_ext_id, dispatcher_vehicle_ext_id, dispatcher_deal_id, " +
  "recipient_name, recipient_email, recipient_phone, recipient_messenger, send_channel, subject, message_text, " +
  "status, sent_by, sent_at, created_at, updated_at";

const SEND_CHANNELS = ["manual", "email", "whatsapp", "telegram", "max", "phone", "other"] as const;
const STATUSES = ["draft", "copied", "sent", "cancelled", "archive"] as const;

const patchSchema = z.object({
  recipient_name: z.string().trim().max(200).nullable().optional(),
  recipient_email: z.string().trim().max(200).nullable().optional(),
  recipient_phone: z.string().trim().max(50).nullable().optional(),
  recipient_messenger: z.string().trim().max(200).nullable().optional(),
  send_channel: z.enum(SEND_CHANNELS).optional(),
  subject: z.string().trim().max(500).nullable().optional(),
  message_text: z.string().trim().min(1).max(20000).optional(),
  status: z.enum(STATUSES).optional(),
  sent_at: z.string().datetime().nullable().optional(),
});

export const Route = createFileRoute("/api/dispatcher/partner-card/sends/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const id = params.id;
        if (!id) return jsonResponse({ error: "id required" }, { status: 400 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            { error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}` },
            { status: 400 },
          );
        }
        const update: Record<string, unknown> = { ...parsed.data };
        if (parsed.data.status === "sent" && !("sent_at" in parsed.data)) {
          update.sent_at = new Date().toISOString();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update(update as never)
          .eq("id", id)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data });
      },
    },
  },
});
