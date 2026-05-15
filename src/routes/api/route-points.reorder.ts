import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Schema = z.object({
  route_id: z.string().uuid(),
  ordered_ids: z.array(z.string().uuid()).min(1).max(500),
  changed_by: z.string().max(255).optional(),
});

export const Route = createFileRoute("/api/route-points/reorder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "driver"]);
        if (auth instanceof Response) return auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Некорректный JSON" }, { status: 400 });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { route_id, ordered_ids, changed_by } = parsed.data;

        // Если водитель — проверяем принадлежность маршрута
        const { data: roleRows } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", auth.userId)
          .in("role", ["admin", "logist", "driver"]);
        const roles = new Set(((roleRows ?? []) as Array<{ role: string }>).map((r) => r.role));
        const isElevated = roles.has("admin") || roles.has("logist");

        if (!isElevated && roles.has("driver")) {
          // Найти drivers.id текущего пользователя
          const { data: driverRow } = await supabaseAdmin
            .from("drivers")
            .select("id")
            .eq("user_id", auth.userId)
            .maybeSingle();
          const driverId = (driverRow as { id: string } | null)?.id ?? null;
          if (!driverId) return jsonResponse({ error: "forbidden" }, { status: 403 });

          // Проверить, что delivery_route с source_request_id = route_id принадлежит этому водителю
          const { data: dr } = await supabaseAdmin
            .from("delivery_routes")
            .select("id, driver_id")
            .eq("source_request_id", route_id)
            .eq("driver_id", driverId)
            .maybeSingle();
          if (!dr) return jsonResponse({ error: "forbidden" }, { status: 403 });

          // Защита от подмены ordered_ids: все точки должны принадлежать этому маршруту
          const { data: pts } = await supabaseAdmin
            .from("route_points")
            .select("id")
            .eq("route_id", route_id)
            .in("id", ordered_ids);
          const found = new Set(((pts ?? []) as Array<{ id: string }>).map((p) => p.id));
          if (found.size !== ordered_ids.length) {
            return jsonResponse({ error: "forbidden" }, { status: 403 });
          }
        }

        const sb = supabaseAdmin;
        const TEMP = 100000;
        for (let i = 0; i < ordered_ids.length; i++) {
          const { error } = await sb
            .from("route_points")
            .update({ point_number: TEMP + i } as never)
            .eq("id", ordered_ids[i]);
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
        }
        for (let i = 0; i < ordered_ids.length; i++) {
          const { error } = await sb
            .from("route_points")
            .update({ point_number: i + 1 } as never)
            .eq("id", ordered_ids[i]);
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
        }
        if (changed_by) {
          await sb
            .from("routes")
            .update({
              points_order_changed_at: new Date().toISOString(),
              points_order_changed_by: changed_by,
            } as never)
            .eq("id", route_id);
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
