import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ROLES = ["admin", "dispatcher"];

interface PointInput {
  kind: "pickup" | "dropoff";
  city?: string | null;
  address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  scheduled_at?: string | null;
  comment?: string | null;
}

interface CreateTripBody {
  vehicle_ext_id: string;
  driver_ext_id: string;
  carrier_ext_id?: string | null;
  deal_id?: string | null;
  cargo_summary?: string | null;
  weight_kg?: number | null;
  volume_m3?: number | null;
  body_type?: string | null;
  rate?: number | null;
  comment?: string | null;
  points: PointInput[];
}

export const Route = createFileRoute("/api/dispatcher/inbound-documents/$id/create-trip")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = await (sb.from("dispatcher_inbound_documents") as any)
          .select("id, carrier_ext_id, storage_bucket, storage_path, attachment_filename, dispatcher_trip_id, processing_status")
          .eq("id", params.id)
          .maybeSingle();
        if (row.error || !row.data)
          return jsonResponse({ error: "not_found" }, { status: 404 });
        if (row.data.dispatcher_trip_id) {
          return jsonResponse(
            { error: "already_linked", trip_id: row.data.dispatcher_trip_id },
            { status: 409 },
          );
        }

        let body: CreateTripBody;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "bad_json" }, { status: 400 });
        }
        if (!body.vehicle_ext_id || !body.driver_ext_id || !Array.isArray(body.points) || body.points.length === 0) {
          return jsonResponse({ error: "missing_fields" }, { status: 400 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tripIns = await (sb.from("dispatcher_trips") as any)
          .insert({
            deal_id: body.deal_id ?? null,
            carrier_ext_id: body.carrier_ext_id ?? row.data.carrier_ext_id,
            vehicle_ext_id: body.vehicle_ext_id,
            driver_ext_id: body.driver_ext_id,
            cargo_summary: body.cargo_summary ?? null,
            weight_kg: body.weight_kg ?? null,
            volume_m3: body.volume_m3 ?? null,
            body_type: body.body_type ?? null,
            rate: body.rate ?? null,
            comment: body.comment ?? null,
            created_by: auth.userId,
            status: "assigned",
          })
          .select("id")
          .maybeSingle();
        if (tripIns.error || !tripIns.data) {
          console.error("[inbound/create-trip] trip insert", tripIns.error);
          return jsonResponse({ error: tripIns.error?.message ?? "trip_failed" }, { status: 500 });
        }
        const tripId = tripIns.data.id as string;

        const points = body.points.map((p, idx) => ({
          trip_id: tripId,
          idx,
          kind: p.kind,
          city: p.city ?? null,
          address: p.address ?? null,
          contact_name: p.contact_name ?? null,
          contact_phone: p.contact_phone ?? null,
          scheduled_at: p.scheduled_at ?? null,
          comment: p.comment ?? null,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pRes = await (sb.from("dispatcher_trip_points") as any).insert(points);
        if (pRes.error) {
          console.error("[inbound/create-trip] points insert", pRes.error);
          return jsonResponse({ error: pRes.error.message }, { status: 500 });
        }

        // Привязать документ к рейсу как dispatcher_trip_documents.
        // Если на этот входящий уже есть подписанный (или вручную загруженный) PDF —
        // прикрепляем именно его, а не исходник.
        let attachPath: string | null = row.data.storage_path ?? null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sigRow: any = await sb
          .from("dispatcher_document_signatures")
          .select("signed_document_path, manual_signed_document_path, status")
          .eq("inbound_document_id", params.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sigRow.data) {
          attachPath =
            (sigRow.data.signed_document_path as string | null) ??
            (sigRow.data.manual_signed_document_path as string | null) ??
            attachPath;
          // Подтянем trip_id в signatures, чтобы driver видел документ.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("dispatcher_document_signatures") as any)
            .update({ trip_id: tripId })
            .eq("inbound_document_id", params.id);
        }
        if (attachPath) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("dispatcher_trip_documents") as any).insert({
            trip_id: tripId,
            kind: "signed_order",
            storage_path: attachPath,
            uploaded_by: auth.userId,
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("dispatcher_inbound_documents") as any)
          .update({
            dispatcher_trip_id: tripId,
            dispatcher_deal_id: body.deal_id ?? null,
            processing_status: "linked",
          })
          .eq("id", params.id);

        return jsonResponse({ ok: true, trip_id: tripId });
      },
    },
  },
});
