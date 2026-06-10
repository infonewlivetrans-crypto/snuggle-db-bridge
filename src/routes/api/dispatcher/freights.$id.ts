import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { freightUpdateSchema } from "@/lib/dispatcher/schemas";

const TABLE = "dispatcher_freights";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, title, loading_city, unloading_city, loading_date, unloading_date, " +
  "cargo_name, weight_kg, volume_m3, body_type, load_methods, rate, " +
  "payment_type, payment_delay_days, source, source_url, " +
  "contact_name, contact_phone, contact_whatsapp, contact_telegram, contact_max_messenger, " +
  "comment, dispatcher_status, freight_kind, " +
  "assigned_carrier_ext_id, assigned_driver_ext_id, assigned_vehicle_ext_id, " +
  "carrier_request_id, deal_id, signed_pdf_document_id, " +
  "signed_sent_at, signed_sent_channel, signed_sent_comment, " +
  "created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/freights/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .select(SELECT)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = freightUpdateSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        // Только реально пришедшие поля — не перетираем БД undefined'ами.
        const updatePatch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(parsed.data)) {
          if (v !== undefined) updatePatch[k] = v;
        }
        if (Object.keys(updatePatch).length === 0) {
          return jsonResponse({ error: "no_fields_to_update" }, { status: 400 });
        }

        // Валидация: водитель/транспорт должны принадлежать выбранному перевозчику.
        const carrierId =
          (updatePatch.assigned_carrier_ext_id as string | null | undefined) ?? undefined;
        const driverId =
          (updatePatch.assigned_driver_ext_id as string | null | undefined) ?? undefined;
        const vehicleId =
          (updatePatch.assigned_vehicle_ext_id as string | null | undefined) ?? undefined;
        if (driverId || vehicleId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c = auth.client as any;
          let effectiveCarrier = carrierId;
          if (effectiveCarrier === undefined) {
            const cur = await c
              .from(TABLE)
              .select("assigned_carrier_ext_id")
              .eq("id", params.id)
              .maybeSingle();
            effectiveCarrier = cur.data?.assigned_carrier_ext_id ?? null;
          }
          if (driverId) {
            const d = await c
              .from("dispatcher_driver_ext")
              .select("dispatcher_carrier_ext_id")
              .eq("id", driverId)
              .maybeSingle();
            if (!d.data) return jsonResponse({ error: "driver_not_found" }, { status: 400 });
            if (
              effectiveCarrier &&
              d.data.dispatcher_carrier_ext_id &&
              d.data.dispatcher_carrier_ext_id !== effectiveCarrier
            ) {
              return jsonResponse(
                { error: "Водитель не относится к выбранному перевозчику" },
                { status: 400 },
              );
            }
          }
          if (vehicleId) {
            const v = await c
              .from("dispatcher_vehicle_ext")
              .select("dispatcher_carrier_ext_id")
              .eq("id", vehicleId)
              .maybeSingle();
            if (!v.data) return jsonResponse({ error: "vehicle_not_found" }, { status: 400 });
            if (
              effectiveCarrier &&
              v.data.dispatcher_carrier_ext_id &&
              v.data.dispatcher_carrier_ext_id !== effectiveCarrier
            ) {
              return jsonResponse(
                { error: "Транспорт не относится к выбранному перевозчику" },
                { status: 400 },
              );
            }
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update(updatePatch as unknown as never)
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (auth.client.from(TABLE as never) as any)
          .update({ dispatcher_status: "archived" } as unknown as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
