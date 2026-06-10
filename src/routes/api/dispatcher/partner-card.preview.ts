import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  buildPartnerCardMessage,
  buildPartnerCardSubject,
  type PartnerCardDoc,
  type PartnerCardPayload,
} from "@/lib/dispatcher/partner-card";

const ALLOWED_ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/partner-card/preview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const carrierId = url.searchParams.get("carrier_id");
        const driverId = url.searchParams.get("driver_id");
        const vehicleId = url.searchParams.get("vehicle_id");
        const dealId = url.searchParams.get("deal_id");
        const comment = url.searchParams.get("comment");

        if (!carrierId) {
          return jsonResponse({ error: "carrier_id required" }, { status: 400 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;

        const carrierRes = await client
          .from("dispatcher_carrier_ext")
          .select(
            "id, name, carrier_kind, inn, ogrn, tax_regime, city, phone, email, ati_id, whatsapp, telegram, max_messenger, bank_name, bank_bik, bank_account, bank_corr_account, verification_status, commission_agreed",
          )
          .eq("id", carrierId)
          .maybeSingle();
        if (carrierRes.error)
          return jsonResponse({ error: carrierRes.error.message }, { status: 500 });
        if (!carrierRes.data)
          return jsonResponse({ error: "carrier_not_found" }, { status: 404 });
        const carrier = carrierRes.data;

        let driver = null;
        if (driverId) {
          const r = await client
            .from("dispatcher_driver_ext")
            .select(
              "id, full_name, phone, city, dispatcher_status, docs_verified, dispatcher_carrier_ext_id",
            )
            .eq("id", driverId)
            .maybeSingle();
          if (r.data && r.data.dispatcher_carrier_ext_id === carrierId) driver = r.data;
        }

        let vehicle = null;
        if (vehicleId) {
          const r = await client
            .from("dispatcher_vehicle_ext")
            .select(
              "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, height_m, load_methods, home_city, dispatcher_status, dispatcher_carrier_ext_id",
            )
            .eq("id", vehicleId)
            .maybeSingle();
          if (r.data && r.data.dispatcher_carrier_ext_id === carrierId) vehicle = r.data;
        }

        let deal = null;
        if (dealId) {
          const r = await client
            .from("dispatcher_deals")
            .select("id, deal_number, deal_status, route_from, route_to, total_rate")
            .eq("id", dealId)
            .maybeSingle();
          if (r.data) deal = r.data;
        }

        // Documents (carrier always; driver/vehicle if selected).
        const ownerIds: { type: "carrier" | "driver" | "vehicle"; id: string }[] = [
          { type: "carrier", id: carrierId },
        ];
        if (driver) ownerIds.push({ type: "driver", id: driver.id });
        if (vehicle) ownerIds.push({ type: "vehicle", id: vehicle.id });

        const documents: PartnerCardDoc[] = [];
        for (const o of ownerIds) {
          const r = await client
            .from("dispatcher_documents")
            .select("title, document_type, document_status")
            .eq("owner_type", o.type)
            .eq("owner_id", o.id)
            .in("document_status", ["uploaded", "checking", "approved"])
            .order("uploaded_at", { ascending: false });
          for (const row of (r.data ?? []) as Array<{
            title: string | null;
            document_type: string | null;
            document_status: string | null;
          }>) {
            documents.push({
              owner_type: o.type,
              title: row.title,
              document_type: row.document_type,
              document_status: row.document_status,
            });
          }
        }

        const payload: PartnerCardPayload = {
          carrier,
          driver,
          vehicle,
          deal,
          documents,
          dispatcher_comment: comment,
        };

        const message_text = buildPartnerCardMessage(payload);
        const subject = buildPartnerCardSubject(payload);

        return jsonResponse({ ok: true, data: payload, message_text, subject });
      },
    },
  },
});
