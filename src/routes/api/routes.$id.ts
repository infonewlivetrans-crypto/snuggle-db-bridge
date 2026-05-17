import { createFileRoute } from "@tanstack/react-router";
import {
  jsonResponse,
  makeAdminClient,
  requireAuth,
  requireAdmin,
  cacheHeaders,
} from "@/server/api-helpers.server";
import { writeAudit } from "@/server/audit.server";

const ALLOWED = new Set([
  "status",
  "comment",
  "points_order_changed_at",
  "points_order_changed_by",
]);

// delivery_route_status, при которых рейс уже не черновик — удаление
// исходной транспортной заявки запрещено.
const NON_DRAFT_DELIVERY_STATUSES = new Set<string>([
  "formed",
  "issued",
  "in_progress",
  "completed",
]);

export const Route = createFileRoute("/api/routes/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("routes")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const r = data as Record<string, unknown> & {
          warehouse_id?: string | null;
          destination_warehouse_id?: string | null;
          vehicle_id?: string | null;
          driver_id?: string | null;
          carrier_id?: string | null;
        };
        const [wh, dwh, veh, drv, car] = await Promise.all([
          r.warehouse_id
            ? auth.client.from("warehouses").select("id, name, city, address").eq("id", r.warehouse_id).maybeSingle()
            : Promise.resolve({ data: null }),
          r.destination_warehouse_id
            ? auth.client.from("warehouses").select("id, name, city, address").eq("id", r.destination_warehouse_id).maybeSingle()
            : Promise.resolve({ data: null }),
          r.vehicle_id
            ? auth.client
                .from("vehicles")
                .select("id, plate_number, brand, model, body_type, capacity_kg, volume_m3")
                .eq("id", r.vehicle_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          r.driver_id
            ? auth.client.from("drivers").select("id, full_name, phone").eq("id", r.driver_id).maybeSingle()
            : Promise.resolve({ data: null }),
          r.carrier_id
            ? auth.client.from("carriers").select("id, company_name").eq("id", r.carrier_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        return jsonResponse(
          {
            ...r,
            warehouse: wh.data ?? null,
            // Алиас, который ожидает фронт detail-страницы:
            source_warehouse: wh.data ?? null,
            destination_warehouse: dwh.data ?? null,
            vehicle: veh.data ?? null,
            driver: drv.data ?? null,
            carrier: car.data ?? null,
          },
          { headers: cacheHeaders(30) },
        );
      },

      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body)) {
          if (ALLOWED.has(k)) updates[k] = v;
        }
        if (Object.keys(updates).length === 0) {
          return jsonResponse({ error: "Нет допустимых полей" }, { status: 400 });
        }
        const { error } = await auth.client.from("routes").update(updates as never).eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        const id = params.id;
        const admin = makeAdminClient();

        // 1. Загружаем заявку для проверки статуса и label.
        const { data: route, error: loadErr } = await admin
          .from("routes")
          .select("id, route_number, status, request_status")
          .eq("id", id)
          .maybeSingle();
        if (loadErr) return jsonResponse({ error: loadErr.message }, { status: 500 });
        if (!route) return jsonResponse({ error: "Заявка не найдена" }, { status: 404 });
        const r = route as {
          id: string;
          route_number: string;
          status: string;
          request_status: string;
        };

        // 2. Сама заявка не должна быть уже в работе.
        if (r.status === "in_progress" || r.status === "completed") {
          return jsonResponse(
            {
              error:
                "Нельзя удалить заявку: маршрут уже в работе или завершён.",
            },
            { status: 409 },
          );
        }

        // 3. По заявке не должно быть активных (нечерновых) рейсов.
        // delivery_routes.source_request_id ссылается на routes.id (FK нет).
        const { data: drList, error: drErr } = await admin
          .from("delivery_routes")
          .select("id, status")
          .eq("source_request_id", id);
        if (drErr) return jsonResponse({ error: drErr.message }, { status: 500 });
        const activeCount = (drList ?? []).filter((d) =>
          NON_DRAFT_DELIVERY_STATUSES.has((d as { status: string }).status),
        ).length;
        if (activeCount > 0) {
          return jsonResponse(
            {
              error: `Нельзя удалить заявку: по ней есть активные рейсы доставки (${activeCount}). Сначала удалите или переведите рейсы в черновик.`,
            },
            { status: 409 },
          );
        }

        // 4. Удаляем оставшиеся delivery_routes-черновики вручную
        // (FK к routes на source_request_id отсутствует).
        const { error: cleanupErr } = await admin
          .from("delivery_routes")
          .delete()
          .eq("source_request_id", id);
        if (cleanupErr) {
          return jsonResponse(
            { error: `Не удалось удалить связанные рейсы-черновики: ${cleanupErr.message}` },
            { status: 500 },
          );
        }

        // 5. Удаляем саму заявку. route_points / route_offers /
        // route_carrier_* имеют FK ON DELETE CASCADE на routes.
        const { error: delErr } = await admin
          .from("routes")
          .delete()
          .eq("id", id);
        if (delErr) {
          return jsonResponse(
            { error: `Не удалось удалить заявку: ${delErr.message}` },
            { status: 500 },
          );
        }

        // 6. Аудит.
        try {
          const { data: prof } = await admin
            .from("profiles")
            .select("full_name")
            .eq("user_id", auth.userId)
            .maybeSingle();
          await writeAudit({
            userId: auth.userId,
            userName: (prof as { full_name?: string | null } | null)?.full_name ?? null,
            userRole: "admin",
            section: "routes",
            action: "delete",
            objectType: "route",
            objectId: r.id,
            objectLabel: r.route_number,
            oldValue: { status: r.status, request_status: r.request_status },
          });
        } catch {
          // ignore
        }

        return jsonResponse({ ok: true });
      },
    },
  },
});
