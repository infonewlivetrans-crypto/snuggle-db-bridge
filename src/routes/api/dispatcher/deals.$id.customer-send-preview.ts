import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  buildCustomerCardMessage,
  buildCustomerCardSubject,
  type CustomerCardPayload,
} from "@/lib/dispatcher/customer-card";

const ALLOWED_ROLES = ["admin", "dispatcher"];

// Статусы, при которых уже можно слать заказчику (после accepted перевозчиком).
const OK_DEAL_STATUSES = new Set([
  "agreed",
  "documents_sent",
  "loading",
  "in_transit",
  "unloading",
  "delivered",
  "waiting_payment",
  "closed",
]);

export const Route = createFileRoute(
  "/api/dispatcher/deals/$id/customer-send-preview",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });

        const url = new URL(request.url);
        const freightId = url.searchParams.get("freight_id");
        const comment = url.searchParams.get("comment");
        if (!freightId)
          return jsonResponse({ error: "freight_id required" }, { status: 400 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;

        const dealRes = await client
          .from("dispatcher_deals")
          .select(
            "id, deal_status, carrier_id, driver_id, vehicle_id, route_from, route_to",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (dealRes.error)
          return jsonResponse({ error: dealRes.error.message }, { status: 500 });
        if (!dealRes.data)
          return jsonResponse({ error: "deal_not_found" }, { status: 404 });
        const deal = dealRes.data;

        if (!OK_DEAL_STATUSES.has(deal.deal_status)) {
          return jsonResponse(
            {
              error: "not_accepted_yet",
              hint: "Сначала перевозчик должен принять предложение",
            },
            { status: 409 },
          );
        }

        const fRes = await client
          .from("dispatcher_freights")
          .select(
            "id, title, loading_city, unloading_city, loading_date, unloading_date, " +
              "cargo_name, weight_kg, volume_m3, " +
              "customer_name, customer_email, customer_emails, customer_phone, customer_send_comment, " +
              "deal_id, assigned_carrier_ext_id, assigned_driver_ext_id, assigned_vehicle_ext_id",
          )
          .eq("id", freightId)
          .maybeSingle();
        if (fRes.error)
          return jsonResponse({ error: fRes.error.message }, { status: 500 });
        if (!fRes.data)
          return jsonResponse({ error: "freight_not_found" }, { status: 404 });
        const freight = fRes.data;

        const carrierId = freight.assigned_carrier_ext_id ?? deal.carrier_id;
        const driverId = freight.assigned_driver_ext_id ?? deal.driver_id;
        const vehicleId = freight.assigned_vehicle_ext_id ?? deal.vehicle_id;

        let carrier = null;
        if (carrierId) {
          const r = await client
            .from("dispatcher_carrier_ext")
            .select("id, name, inn, phone, email, ati_id")
            .eq("id", carrierId)
            .maybeSingle();
          carrier = r.data ?? null;
        }
        let driver = null;
        if (driverId) {
          const r = await client
            .from("dispatcher_driver_ext")
            .select("id, full_name, phone")
            .eq("id", driverId)
            .maybeSingle();
          driver = r.data ?? null;
        }
        let vehicle = null;
        if (vehicleId) {
          const r = await client
            .from("dispatcher_vehicle_ext")
            .select("id, vehicle_kind, body_type, payload_kg, volume_m3")
            .eq("id", vehicleId)
            .maybeSingle();
          vehicle = r.data
            ? { ...r.data, plate: null as string | null }
            : null;
        }

        const dispatcherComment =
          (comment && comment.trim()) || freight.customer_send_comment || null;

        const payload: CustomerCardPayload = {
          freight: {
            loading_city: freight.loading_city,
            unloading_city: freight.unloading_city,
            loading_date: freight.loading_date,
            unloading_date: freight.unloading_date,
            cargo_name: freight.cargo_name,
            title: freight.title,
            weight_kg: freight.weight_kg,
            volume_m3: freight.volume_m3,
            customer_name: freight.customer_name,
          },
          carrier,
          driver,
          vehicle,
          dispatcher_comment: dispatcherComment,
        };

        const recipients: string[] = [];
        if (freight.customer_email) recipients.push(String(freight.customer_email).trim());
        if (Array.isArray(freight.customer_emails)) {
          for (const e of freight.customer_emails as unknown[]) {
            const s = String(e ?? "").trim();
            if (s && !recipients.includes(s)) recipients.push(s);
          }
        }

        return jsonResponse({
          ok: true,
          subject: buildCustomerCardSubject(payload),
          message_text: buildCustomerCardMessage(payload),
          freight,
          recipients,
          deal: { id: deal.id, deal_status: deal.deal_status },
        });
      },
    },
  },
});
