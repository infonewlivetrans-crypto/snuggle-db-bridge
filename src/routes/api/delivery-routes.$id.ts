import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, requireAdmin } from "@/server/api-helpers.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "@/server/audit.server";

const ALLOWED = new Set(["status", "comment"]);

// delivery_route_status, при которых рейс уже выпущен/в работе/завершён.
// Удаление запрещено — только 'draft'/'formed' можно удалять админом.
const NON_DELETABLE_DELIVERY_STATUSES = new Set<string>([
  "issued",
  "in_progress",
  "completed",
]);

export const Route = createFileRoute("/api/delivery-routes/$id")({
  server: {
    handlers: {
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
        const { error } = await auth.client
          .from("delivery_routes")
          .update(updates as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        const id = params.id;

        const { data: dr, error: loadErr } = await supabaseAdmin
          .from("delivery_routes")
          .select("id, route_number, status, current_stage")
          .eq("id", id)
          .maybeSingle();
        if (loadErr) return jsonResponse({ error: loadErr.message }, { status: 500 });
        if (!dr) return jsonResponse({ error: "Рейс не найден" }, { status: 404 });
        const d = dr as {
          id: string;
          route_number: string;
          status: string;
          current_stage: string;
        };

        if (NON_DELETABLE_DELIVERY_STATUSES.has(d.status)) {
          return jsonResponse(
            {
              error:
                "Нельзя удалить рейс: он уже выпущен, в пути или завершён.",
            },
            { status: 409 },
          );
        }
        if (d.current_stage && d.current_stage !== "not_started") {
          return jsonResponse(
            {
              error:
                "Нельзя удалить рейс: водитель уже начал работу по этапам маршрута.",
            },
            { status: 409 },
          );
        }

        // driver_locations, route_stage_events, route_returns,
        // route_order_exclusions имеют FK ON DELETE CASCADE
        // на delivery_routes — каскад отработает.
        const { error: delErr } = await supabaseAdmin
          .from("delivery_routes")
          .delete()
          .eq("id", id);
        if (delErr) {
          return jsonResponse(
            { error: `Не удалось удалить рейс: ${delErr.message}` },
            { status: 500 },
          );
        }

        try {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("user_id", auth.userId)
            .maybeSingle();
          await writeAudit({
            userId: auth.userId,
            userName: (prof as { full_name?: string | null } | null)?.full_name ?? null,
            userRole: "admin",
            section: "delivery_routes",
            action: "delete",
            objectType: "delivery_route",
            objectId: d.id,
            objectLabel: d.route_number,
            oldValue: { status: d.status, current_stage: d.current_stage },
          });
        } catch {
          // ignore
        }

        return jsonResponse({ ok: true });
      },
    },
  },
});
