import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdminOrDirector(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const set = new Set((roles ?? []).map((r) => r.role));
  if (!set.has("admin") && !set.has("director")) {
    throw new Error("Доступ только для администратора и руководителя");
  }
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfDayIso(daysAgo: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabaseAdmin as any;

async function countWith(builder: Promise<{ count: number | null; error: unknown }>): Promise<number> {
  const res = await builder;
  if (res.error) return 0;
  return Number(res.count ?? 0);
}

export const systemActivityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdminOrDirector(context.userId);

    const todayStart = startOfTodayIso();
    const today = new Date().toISOString().slice(0, 10);

    // === Базовые показатели за сегодня ===
    const [
      routesCreatedToday,
      routesCompletedToday,
      ordersProcessedToday,
      errorsToday,
      pointsClosedToday,
      reportsToday,
      driverLocationsToday,
    ] = await Promise.all([
      countWith(sb.from("delivery_routes").select("*", { count: "exact", head: true }).gte("created_at", todayStart)),
      countWith(sb.from("delivery_routes").select("*", { count: "exact", head: true }).eq("status", "completed").gte("updated_at", todayStart)),
      countWith(sb.from("orders").select("*", { count: "exact", head: true }).gte("updated_at", todayStart)),
      countWith(sb.from("system_errors").select("*", { count: "exact", head: true }).gte("created_at", todayStart)),
      countWith(sb.from("route_points").select("*", { count: "exact", head: true }).not("completed_at", "is", null).gte("completed_at", todayStart)),
      countWith(sb.from("delivery_reports").select("*", { count: "exact", head: true }).gte("created_at", todayStart)),
      countWith(sb.from("driver_locations").select("*", { count: "exact", head: true }).gte("captured_at", todayStart)),
    ]);

    // === Уникальные пользователи, заходившие сегодня (по audit_log) ===
    const { data: todayAudit } = await supabaseAdmin
      .from("audit_log")
      .select("user_id, user_role")
      .gte("created_at", todayStart)
      .not("user_id", "is", null)
      .limit(5000);

    const activeUserIds = new Set<string>();
    const byRole: Record<string, number> = {};
    for (const row of (todayAudit ?? []) as Array<{
      user_id: string | null;
      user_role: string | null;
    }>) {
      if (row.user_id) activeUserIds.add(row.user_id);
      const r = row.user_role ?? "unknown";
      byRole[r] = (byRole[r] ?? 0) + 1;
    }

    // === Все активные пользователи + их роли ===
    const [{ data: allProfiles }, { data: allRoles }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, email, is_active")
        .eq("is_active", true)
        .limit(2000),
      supabaseAdmin.from("user_roles").select("user_id, role").limit(5000),
    ]);

    const rolesByUser = new Map<string, string[]>();
    for (const r of (allRoles ?? []) as Array<{ user_id: string; role: string }>) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }

    const inactiveToday = ((allProfiles ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      email: string | null;
    }>)
      .filter((p) => !activeUserIds.has(p.user_id))
      .map((p) => ({
        userId: p.user_id,
        name: p.full_name,
        email: p.email,
        roles: rolesByUser.get(p.user_id) ?? [],
      }))
      .slice(0, 100);

    // === График за 7 дней ===
    const weekStart = startOfDayIso(6);
    const { data: weekAudit } = await supabaseAdmin
      .from("audit_log")
      .select("created_at, user_id")
      .gte("created_at", weekStart)
      .limit(20000);

    const dayBuckets = new Map<string, { actions: number; users: Set<string> }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      dayBuckets.set(d.toISOString().slice(0, 10), { actions: 0, users: new Set() });
    }
    for (const r of (weekAudit ?? []) as Array<{ created_at: string; user_id: string | null }>) {
      const key = r.created_at.slice(0, 10);
      const b = dayBuckets.get(key);
      if (b) {
        b.actions += 1;
        if (r.user_id) b.users.add(r.user_id);
      }
    }
    const weekChart = Array.from(dayBuckets.entries()).map(([date, v]) => ({
      date,
      actions: v.actions,
      users: v.users.size,
    }));

    // === Предупреждения ===
    const warnings: Array<{ kind: string; text: string }> = [];
    if (routesCreatedToday === 0) warnings.push({ kind: "routes", text: "За сегодня не создано ни одного маршрута" });
    if (driverLocationsToday === 0) warnings.push({ kind: "drivers", text: "Нет активности водителей (нет GPS-точек за сегодня)" });
    if (pointsClosedToday === 0) warnings.push({ kind: "points", text: "За сегодня не закрыто ни одной точки доставки" });
    if (reportsToday === 0) warnings.push({ kind: "reports", text: "За сегодня не сдано ни одного отчёта о доставке" });

    return {
      today,
      kpi: {
        usersToday: activeUserIds.size,
        routesCreatedToday,
        routesCompletedToday,
        ordersProcessedToday,
        errorsToday,
        pointsClosedToday,
        reportsToday,
      },
      byRole: {
        driver: byRole.driver ?? 0,
        logist: byRole.logist ?? 0,
        manager: byRole.manager ?? 0,
        warehouse: byRole.warehouse ?? 0,
        director: byRole.director ?? 0,
        admin: byRole.admin ?? 0,
        supply: byRole.supply ?? 0,
      },
      inactiveToday,
      inactiveTotal:
        ((allProfiles ?? []).length) - activeUserIds.size > 0
          ? (allProfiles ?? []).length - activeUserIds.size
          : 0,
      warnings,
      weekChart,
    };
  });
