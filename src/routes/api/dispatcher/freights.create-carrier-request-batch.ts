import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isAdmin, jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { computeCommissionAmount } from "@/lib/dispatcher/carrier-request-schemas";
import { generateCarrierRequestNumber } from "@/lib/dispatcher/carrier-request";

const ALLOWED_ROLES = ["admin", "dispatcher"];

const schema = z.object({
  freight_ids: z.array(z.string().uuid()).min(1).max(20),
  dispatcher_carrier_ext_id: z.string().uuid(),
  dispatcher_driver_ext_id: z.string().uuid().optional().nullable(),
  dispatcher_vehicle_ext_id: z.string().uuid(),
  commission_percent: z.number().min(0).max(100).optional().default(5),
  dispatcher_comment: z.string().max(2000).optional().nullable(),
  payment_type: z
    .enum(["prepayment", "on_loading", "on_unloading", "delayed", "mixed", "other"])
    .optional()
    .nullable(),
  payment_delay_days: z.number().int().min(0).max(365).optional().nullable(),
});

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export const Route = createFileRoute(
  "/api/dispatcher/freights/create-carrier-request-batch",
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        // Vehicle ownership / state check
        const veh = await client
          .from("dispatcher_vehicle_ext")
          .select(
            "id, dispatcher_carrier_ext_id, dispatcher_driver_ext_id, dispatcher_taken_by, dispatcher_work_status",
          )
          .eq("id", d.dispatcher_vehicle_ext_id)
          .maybeSingle();
        if (!veh.data) return jsonResponse({ error: "vehicle_not_found" }, { status: 404 });
        if (veh.data.dispatcher_carrier_ext_id !== d.dispatcher_carrier_ext_id) {
          return jsonResponse(
            { error: "vehicle_carrier_mismatch" },
            { status: 400 },
          );
        }
        const admin = await isAdmin(auth.client, auth.userId);
        if (!admin) {
          if (veh.data.dispatcher_taken_by && veh.data.dispatcher_taken_by !== auth.userId) {
            console.warn("[dispatcher.batch-offer] vehicle_taken_by_other", {
              vehicle_id: d.dispatcher_vehicle_ext_id,
              requester: auth.userId,
              taken_by: veh.data.dispatcher_taken_by,
            });
            return jsonResponse(
              { error: "vehicle_taken_by_other" },
              { status: 409 },
            );
          }
          if (veh.data.dispatcher_work_status !== "in_work") {
            console.warn("[dispatcher.batch-offer] vehicle_not_in_work", {
              vehicle_id: d.dispatcher_vehicle_ext_id,
              work_status: veh.data.dispatcher_work_status,
            });
            return jsonResponse(
              { error: "vehicle_not_in_work" },
              { status: 409 },
            );
          }
        }
        // Validate driver belongs to carrier (if provided)
        if (d.dispatcher_driver_ext_id) {
          const drv = await client
            .from("dispatcher_driver_ext")
            .select("id, dispatcher_carrier_ext_id")
            .eq("id", d.dispatcher_driver_ext_id)
            .maybeSingle();
          if (!drv.data || drv.data.dispatcher_carrier_ext_id !== d.dispatcher_carrier_ext_id) {
            return jsonResponse(
              { error: "driver_carrier_mismatch" },
              { status: 400 },
            );
          }
        }

        // Load all selected freights
        const fr = await client
          .from("dispatcher_freights")
          .select(
            "id, cargo_name, loading_city, loading_date, unloading_city, unloading_date, " +
              "rate, weight_kg, volume_m3, payment_type, payment_delay_days, " +
              "assigned_vehicle_ext_id, carrier_request_id, dispatcher_status, comment",
          )
          .in("id", d.freight_ids);
        if (fr.error) return jsonResponse({ error: fr.error.message }, { status: 500 });
        const freights = (fr.data ?? []) as Array<Record<string, unknown>>;
        if (freights.length !== d.freight_ids.length) {
          return jsonResponse({ error: "some_freights_not_found" }, { status: 404 });
        }
        for (const f of freights) {
          if (f.assigned_vehicle_ext_id !== d.dispatcher_vehicle_ext_id) {
            return jsonResponse(
              { error: "freight_not_on_this_vehicle", freight_id: f.id },
              { status: 400 },
            );
          }
          if (f.carrier_request_id) {
            return jsonResponse(
              { error: "freight_already_offered", freight_id: f.id },
              { status: 409 },
            );
          }
          const st = String(f.dispatcher_status ?? "");
          if (
            [
              "archived",
              "cancelled",
              "rejected",
              "not_suitable",
              "taken_by_other",
              "not_actual",
              "no_answer",
              "bad_rate",
              "suspicious",
            ].includes(st)
          ) {
            return jsonResponse(
              {
                error: "freight_status_blocks_offer",
                freight_id: f.id,
                status: st,
                message:
                  "Один из выбранных грузов больше неактуален и не может быть предложен перевозчику.",
              },
              { status: 409 },
            );
          }

        }

        // Sort by loading_date for stable ordering
        const sorted = [...freights].sort((a, b) => {
          const da = String(a.loading_date ?? "");
          const db = String(b.loading_date ?? "");
          return da.localeCompare(db);
        });
        const totalRate = sorted.reduce(
          (sum, f) => sum + (toNum(f.rate) ?? 0),
          0,
        );
        const totalWeight = sorted.reduce(
          (sum, f) => sum + (toNum(f.weight_kg) ?? 0),
          0,
        );
        const totalVolume = sorted.reduce(
          (sum, f) => sum + (toNum(f.volume_m3) ?? 0),
          0,
        );
        const loadingCity = sorted[0].loading_city as string | null;
        const unloadingCity = sorted[sorted.length - 1].unloading_city as string | null;
        const loadingDate = sorted[0].loading_date as string | null;
        const unloadingDate = sorted[sorted.length - 1].unloading_date as string | null;
        const cargoName = sorted
          .map((f) => (f.cargo_name as string | null) ?? "груз")
          .join(" + ");

        const pct = d.commission_percent ?? 5;
        const commissionAmount = computeCommissionAmount(totalRate || null, pct);

        // Terms: list all freights
        const termsLines = [
          `Рейс из ${sorted.length} груз(а):`,
          ...sorted.map((f, i) => {
            const r = toNum(f.rate);
            return (
              `${i + 1}. ${(f.loading_city as string | null) ?? "—"} → ` +
              `${(f.unloading_city as string | null) ?? "—"}` +
              ` (${(f.loading_date as string | null) ?? "—"} → ` +
              `${(f.unloading_date as string | null) ?? "—"}); ` +
              `${(f.cargo_name as string | null) ?? "—"}` +
              (r != null ? `; ставка ${r} RUB` : "") +
              (toNum(f.weight_kg) != null ? `; ${toNum(f.weight_kg)} кг` : "") +
              (toNum(f.volume_m3) != null ? `; ${toNum(f.volume_m3)} м³` : "")
            );
          }),
          "",
          `Итого ставка: ${totalRate} RUB`,
          `Итого вес: ${totalWeight} кг`,
          `Итого объём: ${totalVolume} м³`,
        ];

        const insert: Record<string, unknown> = {
          dispatcher_carrier_ext_id: d.dispatcher_carrier_ext_id,
          dispatcher_driver_ext_id: d.dispatcher_driver_ext_id ?? veh.data.dispatcher_driver_ext_id ?? null,
          dispatcher_vehicle_ext_id: d.dispatcher_vehicle_ext_id,
          request_number: generateCarrierRequestNumber(),
          cargo_name: cargoName,
          loading_city: loadingCity,
          loading_date: loadingDate,
          unloading_city: unloadingCity,
          unloading_date: unloadingDate,
          rate_amount: totalRate || null,
          rate_currency: "RUB",
          payment_type: d.payment_type ?? null,
          payment_delay_days: d.payment_delay_days ?? null,
          commission_percent: pct,
          commission_amount: commissionAmount,
          terms_text: termsLines.join("\n"),
          dispatcher_comment: d.dispatcher_comment ?? null,
          request_status: "sent",
          sent_at: new Date().toISOString(),
          sent_by: auth.userId,
        };

        const ins = await client
          .from("dispatcher_carrier_requests")
          .insert(insert as never)
          .select("id, request_number, request_status")
          .single();
        if (ins.error)
          return jsonResponse({ error: ins.error.message }, { status: 500 });

        // Link selected freights to the new carrier request and mark as offered.
        await client
          .from("dispatcher_freights")
          .update({
            dispatcher_status: "offered",
            parse_status: "converted",
            carrier_request_id: ins.data.id,
            assigned_carrier_ext_id: d.dispatcher_carrier_ext_id,
            assigned_driver_ext_id: d.dispatcher_driver_ext_id ?? veh.data.dispatcher_driver_ext_id ?? null,
            assigned_vehicle_ext_id: d.dispatcher_vehicle_ext_id,
          } as never)
          .in("id", d.freight_ids);

        // Mark vehicle as offered.
        await client
          .from("dispatcher_vehicle_ext")
          .update({ dispatcher_work_status: "offered" } as never)
          .eq("id", d.dispatcher_vehicle_ext_id);

        return jsonResponse(
          { row: ins.data, freight_count: sorted.length, total_rate: totalRate },
          { status: 201 },
        );
      },
    },
  },
});
