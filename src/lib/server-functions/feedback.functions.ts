import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireCookieAuth } from "@/server/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLES = ["driver", "logist", "manager", "warehouse", "director"] as const;

const SubmitInput = z.object({
  role: z.enum(ROLES),
  routeId: z.string().uuid().optional().nullable(),
  routeLabel: z.string().max(200).optional().nullable(),
  good: z.string().max(2000).optional().nullable(),
  bad: z.string().max(2000).optional().nullable(),
  broken: z.string().max(2000).optional().nullable(),
  unclear: z.string().max(2000).optional().nullable(),
  needed: z.string().max(2000).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
  ratingConvenience: z.number().int().min(1).max(5),
  ratingSpeed: z.number().int().min(1).max(5),
  ratingStability: z.number().int().min(1).max(5),
  severity: z.enum(["normal", "critical", "suggestion"]).default("normal"),
});

export const submitFeedbackFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((d) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("feedback").insert({
      user_id: context.userId,
      user_name: (prof as { full_name?: string | null } | null)?.full_name ?? null,
      role: data.role,
      route_id: data.routeId ?? null,
      route_label: data.routeLabel ?? null,
      good: data.good ?? null,
      bad: data.bad ?? null,
      broken: data.broken ?? null,
      unclear: data.unclear ?? null,
      needed: data.needed ?? null,
      comment: data.comment ?? null,
      rating_convenience: data.ratingConvenience,
      rating_speed: data.ratingSpeed,
      rating_stability: data.ratingStability,
      severity: data.severity,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listFeedbackFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((d) =>
    z
      .object({
        role: z.enum(ROLES).optional().nullable(),
        severity: z.enum(["normal", "critical", "suggestion"]).optional().nullable(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("director")) {
      throw new Error("Нет доступа к сводке обратной связи");
    }

    let q = supabaseAdmin
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.role) q = q.eq("role", data.role);
    if (data.severity) q = q.eq("severity", data.severity);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Сводка
    const items = rows ?? [];
    const total = items.length;
    const avg = (k: "rating_convenience" | "rating_speed" | "rating_stability") =>
      total === 0 ? 0 : items.reduce((s, r) => s + (Number((r as Record<string, unknown>)[k]) || 0), 0) / total;

    const byRole: Record<string, number> = {};
    for (const r of items) {
      const role = String((r as { role: string }).role);
      byRole[role] = (byRole[role] ?? 0) + 1;
    }

    const critical = items.filter((r) => (r as { severity: string }).severity === "critical").length;
    const suggestions = items.filter((r) => (r as { severity: string }).severity === "suggestion").length;

    return {
      items,
      summary: {
        total,
        critical,
        suggestions,
        byRole,
        avgConvenience: avg("rating_convenience"),
        avgSpeed: avg("rating_speed"),
        avgStability: avg("rating_stability"),
      },
    };
  });
