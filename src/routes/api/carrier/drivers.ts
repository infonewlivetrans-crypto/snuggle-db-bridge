import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET /api/carrier/drivers — водители текущего перевозчика.
// Источник 1: production `drivers` по carrier_id.
// Источник 2: `dispatcher_driver_ext` по dispatcher_carrier_ext_id
//             (расширенные карточки из AI-диспетчера, ещё не синхронизированные
//             с production). Это позволяет кабинету видеть водителей, заведённых
//             только в диспетчере. Только чтение.

type DriverRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  license_number: string | null;
  license_categories: string | null;
  is_active: boolean | null;
  source: "production" | "dispatcher";
};

const EXT_INACTIVE = new Set(["blocked", "archive", "inactive"]);

export const Route = createFileRoute("/api/carrier/drivers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) {
          return jsonResponse({
            ok: false,
            reason: "no_carrier_linked",
            rows: [],
            total: 0,
          });
        }

        const rows: DriverRow[] = [];
        const seenProdIds = new Set<string>();

        // (1) production drivers
        const prodRes = await ctx.admin
          .from("drivers")
          .select(
            "id, full_name, phone, license_number, license_categories, " +
              "is_active, created_at",
          )
          .eq("carrier_id", ctx.carrierId)
          .order("created_at", { ascending: false });
        if (!prodRes.error && prodRes.data) {
          for (const d of prodRes.data) {
            rows.push({
              id: d.id,
              full_name: d.full_name,
              phone: d.phone,
              license_number: d.license_number,
              license_categories: d.license_categories,
              is_active: d.is_active,
              source: "production",
            });
            seenProdIds.add(d.id);
          }
        }

        // (2) dispatcher_driver_ext по этой же карточке
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extRes = await (ctx.admin.from("dispatcher_driver_ext" as never) as any)
          .select(
            "id, full_name, phone, dispatcher_status, production_driver_id, created_at",
          )
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .order("created_at", { ascending: false });
        if (!extRes.error && extRes.data) {
          for (const d of extRes.data as Array<{
            id: string;
            full_name: string | null;
            phone: string | null;
            dispatcher_status: string | null;
            production_driver_id: string | null;
          }>) {
            // не дублируем, если уже есть production-запись
            if (d.production_driver_id && seenProdIds.has(d.production_driver_id)) continue;
            rows.push({
              id: d.id,
              full_name: d.full_name,
              phone: d.phone,
              license_number: null,
              license_categories: null,
              is_active: !EXT_INACTIVE.has(d.dispatcher_status ?? ""),
              source: "dispatcher",
            });
          }
        }

        return jsonResponse({
          ok: true,
          rows,
          total: rows.length,
        });
      },
    },
  },
});
