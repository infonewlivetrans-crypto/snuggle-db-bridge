import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { computeCommissionAmount } from "@/lib/dispatcher/carrier-request-schemas";
import { generateCarrierRequestNumber } from "@/lib/dispatcher/carrier-request";

const ALLOWED_ROLES = ["admin", "dispatcher"];

const schema = z.object({
  dispatcher_carrier_ext_id: z.string().uuid(),
  dispatcher_driver_ext_id: z.string().uuid().optional().nullable(),
  dispatcher_vehicle_ext_id: z.string().uuid().optional().nullable(),
  commission_percent: z.number().min(0).max(100).optional().default(5),
  dispatcher_comment: z.string().max(2000).optional().nullable(),
});

export const Route = createFileRoute(
  "/api/dispatcher/freights/$id/create-carrier-request",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            {
              error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}`,
            },
            { status: 400 },
          );
        }
        const d = parsed.data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;

        const f = await client
          .from("dispatcher_freights")
          .select(
            "id, cargo_name, loading_city, loading_date, unloading_city, unloading_date, " +
              "rate, payment_type, payment_delay_days, comment, customer_name, " +
              "customer_email, customer_phone",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (!f.data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const fr = f.data as Record<string, unknown>;

        const rate = (fr.rate as number | null) ?? null;
        const commissionAmount = computeCommissionAmount(rate, d.commission_percent);

        const insert: Record<string, unknown> = {
          dispatcher_carrier_ext_id: d.dispatcher_carrier_ext_id,
          dispatcher_driver_ext_id: d.dispatcher_driver_ext_id ?? null,
          dispatcher_vehicle_ext_id: d.dispatcher_vehicle_ext_id ?? null,
          request_number: generateCarrierRequestNumber(),
          cargo_name: fr.cargo_name ?? null,
          loading_city: fr.loading_city ?? null,
          loading_date: fr.loading_date ?? null,
          unloading_city: fr.unloading_city ?? null,
          unloading_date: fr.unloading_date ?? null,
          rate_amount: rate,
          rate_currency: "RUB",
          payment_type: fr.payment_type ?? null,
          payment_delay_days: fr.payment_delay_days ?? null,
          commission_percent: d.commission_percent,
          commission_amount: commissionAmount,
          customer_name: fr.customer_name ?? null,
          customer_email: fr.customer_email ?? null,
          customer_phone: fr.customer_phone ?? null,
          dispatcher_comment:
            d.dispatcher_comment ?? (fr.comment as string | null) ?? null,
          request_status: "draft",
          created_by: auth.userId,
        };

        const ins = await client
          .from("dispatcher_carrier_requests")
          .insert(insert as never)
          .select("id, request_number, request_status")
          .single();
        if (ins.error)
          return jsonResponse({ error: ins.error.message }, { status: 500 });

        // Помечаем заявку-груз как переданную в работу.
        await client
          .from("dispatcher_freights")
          .update({ parse_status: "converted", dispatcher_status: "offered" } as never)
          .eq("id", params.id);

        return jsonResponse({ row: ins.data }, { status: 201 });
      },
    },
  },
});
