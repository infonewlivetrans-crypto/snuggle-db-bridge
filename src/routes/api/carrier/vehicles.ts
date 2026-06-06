import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { VEHICLE_STATUSES, LOAD_METHODS } from "@/lib/dispatcher/statuses";

const SELECT =
  "id, vehicle_kind, body_type, payload_kg, volume_m3, length_m, width_m, height_m, " +
  "load_methods, home_city, ready_to_cities, ready_date, dispatcher_driver_ext_id, " +
  "dispatcher_carrier_ext_id, dispatcher_status, minimum_trip_rate, minimum_km_rate, " +
  "city_rate, point_rate, rate_comment, dispatcher_comment, docs_status, " +
  "created_at, updated_at";

const numNullable = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

const textNullable = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null) return null;
      const s = String(v).trim().slice(0, max);
      return s.length === 0 ? null : s;
    });

const bodySchema = z.object({
  // Марка/модель/госномер пока храним строкой в vehicle_kind, без правки таблицы.
  vehicle_kind: textNullable(255),
  body_type: textNullable(120),
  payload_kg: numNullable,
  volume_m3: numNullable,
  length_m: numNullable,
  width_m: numNullable,
  height_m: numNullable,
  load_methods: z
    .union([z.array(z.enum(LOAD_METHODS)), z.null(), z.undefined()])
    .transform((v) => (v && v.length ? v : null)),
  home_city: textNullable(120),
  ready_date: textNullable(20), // YYYY-MM-DD
  dispatcher_driver_ext_id: textNullable(64),
  dispatcher_status: z
    .union([z.enum(VEHICLE_STATUSES), z.null(), z.undefined()])
    .transform((v) => v ?? null),
  dispatcher_comment: textNullable(2000),
});

export const Route = createFileRoute("/api/carrier/vehicles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;

        const url = new URL(request.url);
        const includeArchive = url.searchParams.get("include_archive") === "true";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .select(SELECT)
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .order("created_at", { ascending: false });
        if (!includeArchive) q = q.neq("dispatcher_status", "archive");
        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [], total: data?.length ?? 0 });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        const payload = {
          ...parsed.data,
          // Принудительно — нельзя создать машину чужому перевозчику.
          dispatcher_carrier_ext_id: ctx.dispatcherCarrierExtId,
          dispatcher_status: parsed.data.dispatcher_status ?? "new",
          docs_status: "not_uploaded",
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .insert(payload as never)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data }, { status: 201 });
      },
    },
  },
});
