import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { VEHICLE_STATUSES, LOAD_METHODS } from "@/lib/dispatcher/statuses";

const SELECT =
  "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, height_m, " +
  "load_methods, home_city, ready_to_cities, ready_date, dispatcher_driver_ext_id, " +
  "dispatcher_carrier_ext_id, dispatcher_status, dispatcher_comment, docs_status, " +
  "created_at, updated_at";

const numN = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });
const textN = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null) return null;
      const s = String(v).trim().slice(0, max);
      return s.length === 0 ? null : s;
    });

const patchSchema = z.object({
  vehicle_kind: textN(255).optional(),
  body_type: textN(120).optional(),
  payload_kg: numN.optional(),
  volume_m3: numN.optional(),
  length_m: numN.optional(),
  width_m: numN.optional(),
  height_m: numN.optional(),
  load_methods: z
    .union([z.array(z.enum(LOAD_METHODS)), z.null(), z.undefined()])
    .transform((v) => (v && v.length ? v : null))
    .optional(),
  home_city: textN(120).optional(),
  ready_date: textN(20).optional(),
  dispatcher_driver_ext_id: textN(64).optional(),
  dispatcher_status: z
    .union([z.enum(VEHICLE_STATUSES), z.null(), z.undefined()])
    .transform((v) => v ?? undefined)
    .optional(),
  dispatcher_comment: textN(2000).optional(),
});

async function assertOwnership(
  ctx: { admin: ReturnType<typeof Object>; dispatcherCarrierExtId: string },
  id: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((ctx as any).admin.from("dispatcher_vehicle_ext") as any)
    .select("id, dispatcher_carrier_ext_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return false;
  return data.dispatcher_carrier_ext_id === ctx.dispatcherCarrierExtId;
}

export const Route = createFileRoute("/api/carrier/vehicles/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;
        if (!params.id) return jsonResponse({ error: "id_required" }, { status: 400 });
        if (!(await assertOwnership(ctx, params.id)))
          return jsonResponse({ error: "not_found_or_forbidden" }, { status: 404 });

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }
        const parsed = patchSchema.safeParse(raw);
        if (!parsed.success) {
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .update(parsed.data as never)
          .eq("id", params.id)
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;
        if (!params.id) return jsonResponse({ error: "id_required" }, { status: 400 });
        if (!(await assertOwnership(ctx, params.id)))
          return jsonResponse({ error: "not_found_or_forbidden" }, { status: 404 });

        // Soft-delete: переводим в archive, физически не удаляем.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .update({ dispatcher_status: "archive" } as never)
          .eq("id", params.id)
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
