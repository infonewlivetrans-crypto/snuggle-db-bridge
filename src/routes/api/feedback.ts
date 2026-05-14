import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole, requireAuth } from "@/server/api-helpers.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLES = ["driver", "logist", "manager", "warehouse", "director"] as const;
type FeedbackRole = (typeof ROLES)[number];
const ROLE_SET = new Set<string>(ROLES);

export const Route = createFileRoute("/api/feedback")({
  server: {
    handlers: {
      // Список (только admin/director)
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "director"]);
        if (auth instanceof Response) return auth;
        try {
          const url = new URL(request.url);
          const role = url.searchParams.get("role");
          const severity = url.searchParams.get("severity");

          let q = supabaseAdmin.from("feedback").select("*").order("created_at", { ascending: false }).limit(500);
          if (role) q = q.eq("role", role);
          if (severity) q = q.eq("severity", severity);
          const { data: rows, error } = await q;
          if (error) throw new Error(error.message);
          const items = rows ?? [];
          const total = items.length;
          const avg = (k: "rating_convenience" | "rating_speed" | "rating_stability") =>
            total === 0 ? 0 : items.reduce((s, r) => s + (Number((r as Record<string, unknown>)[k]) || 0), 0) / total;
          const byRole: Record<string, number> = {};
          for (const r of items) {
            const ro = String((r as { role: string }).role);
            byRole[ro] = (byRole[ro] ?? 0) + 1;
          }
          const critical = items.filter((r) => (r as { severity: string }).severity === "critical").length;
          const suggestions = items.filter((r) => (r as { severity: string }).severity === "suggestion").length;
          return jsonResponse({
            items,
            summary: { total, critical, suggestions, byRole, avgConvenience: avg("rating_convenience"), avgSpeed: avg("rating_speed"), avgStability: avg("rating_stability") },
          });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const role = String(body.role ?? "");
          if (!ROLE_SET.has(role)) return jsonResponse({ error: "Недопустимая роль" }, { status: 400 });
          const ratingC = Number(body.ratingConvenience), ratingS = Number(body.ratingSpeed), ratingSt = Number(body.ratingStability);
          if (![ratingC, ratingS, ratingSt].every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) {
            return jsonResponse({ error: "Оценки должны быть от 1 до 5" }, { status: 400 });
          }
          const severity = String(body.severity ?? "normal");
          if (!["normal", "critical", "suggestion"].includes(severity)) {
            return jsonResponse({ error: "Недопустимая категория" }, { status: 400 });
          }
          const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("user_id", auth.userId).maybeSingle();
          const { error } = await supabaseAdmin.from("feedback").insert({
            user_id: auth.userId,
            user_name: (prof as { full_name?: string | null } | null)?.full_name ?? null,
            role: role as FeedbackRole,
            route_id: (body.routeId as string | null) ?? null,
            route_label: (body.routeLabel as string | null) ?? null,
            good: (body.good as string | null) ?? null,
            bad: (body.bad as string | null) ?? null,
            broken: (body.broken as string | null) ?? null,
            unclear: (body.unclear as string | null) ?? null,
            needed: (body.needed as string | null) ?? null,
            comment: (body.comment as string | null) ?? null,
            rating_convenience: ratingC,
            rating_speed: ratingS,
            rating_stability: ratingSt,
            severity,
          });
          if (error) throw new Error(error.message);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
