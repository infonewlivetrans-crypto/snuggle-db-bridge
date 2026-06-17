import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET  /api/carrier/drivers — список водителей текущего перевозчика.
// POST /api/carrier/drivers — создание водителя.
// Production: user-client + RLS, без service_role.

type DriverRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  telegram: string | null;
  max_messenger: string | null;
  city: string | null;
  license_number: string | null;
  license_categories: string | null;
  dispatcher_status: string | null;
  dispatcher_comment: string | null;
  docs_verified: boolean | null;
  is_active: boolean | null;
  source: "production" | "dispatcher";
};

const EXT_INACTIVE = new Set(["blocked", "archive", "inactive"]);

const CARRIER_DRIVER_INSERT_FIELDS = [
  "full_name",
  "phone",
  "email",
  "whatsapp",
  "telegram",
  "max_messenger",
  "city",
  "dispatcher_comment",
] as const;

const CARRIER_DRIVER_STATUSES = new Set([
  "new",
  "docs_unchecked",
  "ready_to_work",
  "free",
  "on_trip",
  "resting",
  "inactive",
  "archive",
]);

export const Route = createFileRoute("/api/carrier/drivers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) {
          return jsonResponse({ ok: false, reason: "no_carrier_linked", rows: [], total: 0 });
        }

        const rows: DriverRow[] = [];
        const seenProdIds = new Set<string>();

        const prodRes = await ctx.admin
          .from("drivers")
          .select(
            "id, full_name, phone, license_number, license_categories, is_active, created_at",
          )
          .eq("carrier_id", ctx.carrierId)
          .order("created_at", { ascending: false });
        if (!prodRes.error && prodRes.data) {
          for (const d of prodRes.data as unknown as Array<{
            id: string;
            full_name: string | null;
            phone: string | null;
            license_number: string | null;
            license_categories: string | null;
            is_active: boolean | null;
          }>) {
            rows.push({
              id: d.id,
              full_name: d.full_name,
              phone: d.phone,
              email: null,
              whatsapp: null,
              telegram: null,
              max_messenger: null,
              city: null,
              license_number: d.license_number,
              license_categories: d.license_categories,
              dispatcher_status: null,
              dispatcher_comment: null,
              docs_verified: null,
              is_active: d.is_active,
              source: "production",
            });
            seenProdIds.add(d.id);
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extRes = await (ctx.admin.from("dispatcher_driver_ext" as never) as any)
          .select(
            "id, full_name, phone, email, whatsapp, telegram, max_messenger, city, " +
              "dispatcher_status, dispatcher_comment, docs_verified, production_driver_id, created_at",
          )
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .order("created_at", { ascending: false });

        if (!extRes.error && extRes.data) {
          for (const d of extRes.data as Array<Record<string, unknown>>) {
            const prodId = d.production_driver_id as string | null;
            if (prodId && seenProdIds.has(prodId)) continue;
            rows.push({
              id: d.id as string,
              full_name: d.full_name as string | null,
              phone: d.phone as string | null,
              email: d.email as string | null,
              whatsapp: d.whatsapp as string | null,
              telegram: d.telegram as string | null,
              max_messenger: d.max_messenger as string | null,
              city: d.city as string | null,
              license_number: null,
              license_categories: null,
              dispatcher_status: d.dispatcher_status as string | null,
              dispatcher_comment: d.dispatcher_comment as string | null,
              docs_verified: d.docs_verified as boolean | null,
              is_active: !EXT_INACTIVE.has((d.dispatcher_status as string | null) ?? ""),
              source: "dispatcher",
            });
          }
        }

        return jsonResponse({ ok: true, rows, total: rows.length });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }

        const isSelf = body.is_self === true;

        // Если "Я сам водитель" — проверяем, нет ли уже такого driver_ext
        // у этого перевозчика, чтобы не плодить дубли.
        if (isSelf) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = await (ctx.admin.from("dispatcher_driver_ext" as never) as any)
            .select("id")
            .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
            .eq("user_id", auth.userId)
            .maybeSingle();
          if (existing.data?.id) {
            return jsonResponse({ ok: true, id: existing.data.id, existed: true });
          }
        }

        const insert: Record<string, unknown> = {
          dispatcher_carrier_ext_id: ctx.dispatcherCarrierExtId,
          dispatcher_status: "new",
        };
        for (const k of CARRIER_DRIVER_INSERT_FIELDS) if (k in body) insert[k] = body[k];
        if (
          typeof body.dispatcher_status === "string" &&
          CARRIER_DRIVER_STATUSES.has(body.dispatcher_status)
        ) {
          insert.dispatcher_status = body.dispatcher_status;
        }
        if (isSelf) {
          insert.user_id = auth.userId;
          insert.is_owner_driver = true;
          if (!insert.full_name && typeof body.full_name === "string") {
            insert.full_name = body.full_name;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ins = await (ctx.admin.from("dispatcher_driver_ext" as never) as any)
          .insert(insert)
          .select("id")
          .single();
        if (ins.error) {
          return jsonResponse(
            { error: "insert_failed", detail: ins.error.message },
            { status: 400 },
          );
        }

        // Optional: bind a vehicle to this new driver if vehicle_id provided.
        const vehicleId = typeof body.vehicle_id === "string" ? body.vehicle_id : null;
        if (vehicleId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
            .update({ dispatcher_driver_ext_id: ins.data.id })
            .eq("id", vehicleId);
        }

        return jsonResponse({ ok: true, id: ins.data.id });
      },
    },
  },
});

export { CARRIER_DRIVER_INSERT_FIELDS, CARRIER_DRIVER_STATUSES };
