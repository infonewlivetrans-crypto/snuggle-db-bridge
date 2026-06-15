import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { carrierRespondSchema } from "@/lib/dispatcher/carrier-request-schemas";

const TABLE = "dispatcher_carrier_requests";
const SELECT =
  "id, dispatcher_carrier_ext_id, request_status, carrier_comment, responded_at, responded_by";

export const Route = createFileRoute("/api/carrier/requests/$id/respond")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = carrierRespondSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            { error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}` },
            { status: 400 },
          );
        }
        const { request_status, carrier_comment } = parsed.data;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = ctx.admin as any;
        // Проверяем принадлежность заявки перевозчику.
        const cur = await client
          .from(TABLE)
          .select("id, dispatcher_carrier_ext_id, dispatcher_vehicle_ext_id, request_status")
          .eq("id", params.id)
          .maybeSingle();
        if (!cur.data) return jsonResponse({ error: "not_found" }, { status: 404 });
        if (cur.data.dispatcher_carrier_ext_id !== ctx.dispatcherCarrierExtId) {
          console.warn("[carrier.requests.respond] carrier_ownership_failed", {
            request_id: params.id,
            user_id: auth.userId,
            request_carrier_id: cur.data.dispatcher_carrier_ext_id,
            user_carrier_id: ctx.dispatcherCarrierExtId,
          });
          return jsonResponse({ error: "forbidden" }, { status: 403 });
        }

        const update: Record<string, unknown> = { request_status };
        if (carrier_comment !== undefined) update.carrier_comment = carrier_comment;
        if (request_status === "accepted" || request_status === "declined") {
          update.responded_at = new Date().toISOString();
          update.responded_by = auth.userId;
        }

        const { data, error } = await client
          .from(TABLE)
          .update(update)
          .eq("id", params.id)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        // Side-effects on linked freights and vehicle.
        if (request_status === "accepted") {
          await client
            .from("dispatcher_freights")
            .update({ dispatcher_status: "booked" })
            .eq("carrier_request_id", params.id);
          if (cur.data.dispatcher_vehicle_ext_id) {
            await client
              .from("dispatcher_vehicle_ext")
              .update({ dispatcher_work_status: "accepted" })
              .eq("id", cur.data.dispatcher_vehicle_ext_id);
          }
        } else if (request_status === "declined") {
          // Возвращаем грузы в подбор; carrier_request_id оставляем для истории.
          await client
            .from("dispatcher_freights")
            .update({ dispatcher_status: "checking" })
            .eq("carrier_request_id", params.id);
          if (cur.data.dispatcher_vehicle_ext_id) {
            await client
              .from("dispatcher_vehicle_ext")
              .update({ dispatcher_work_status: "in_work" })
              .eq("id", cur.data.dispatcher_vehicle_ext_id);
          }
        }
        return jsonResponse({ row: data });
      },
    },
  },
});
