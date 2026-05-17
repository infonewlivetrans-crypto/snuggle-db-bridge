import { createServerFn } from "@tanstack/react-start";
import { requireCookieAuth } from "@/server/auth-middleware";
import { makeAdminClient } from "@/server/api-helpers.server";
const supabaseAdmin = makeAdminClient();
import { assertCallerIsAdmin } from "./users.server";
import { adminCreateInvite, type InviteRow } from "./invites.server";

const STAFF_ROLES = ["admin", "logist", "manager"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

async function assertCallerIsStaff(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", STAFF_ROLES as unknown as StaffRole[]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Доступ запрещён: требуется роль администратора, логиста или менеджера");
  }
}

export type DriverAccessStatus = {
  driverId: string;
  hasUserId: boolean;
  inviteId: string | null;
  token: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
};

/**
 * Возвращает статус доступа для каждого водителя:
 * привязан ли auth-пользователь, есть ли активный invite, активирован ли он.
 */
export const listDriverAccessStatusFn = createServerFn({ method: "GET" })
  .middleware([requireCookieAuth])
  .handler(async ({ context }) => {
    await assertCallerIsStaff(context.userId);

    const { data: drivers, error: dErr } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id");
    if (dErr) throw new Error(dErr.message);

    const { data: invites, error: iErr } = await supabaseAdmin
      .from("invite_tokens")
      .select("id, driver_id, token, is_active, last_used_at, created_at")
      .eq("role", "driver")
      .order("created_at", { ascending: false });
    if (iErr) throw new Error(iErr.message);

    const byDriver = new Map<string, NonNullable<typeof invites>[number]>();
    for (const inv of invites ?? []) {
      const did = (inv as { driver_id: string | null }).driver_id;
      if (did && !byDriver.has(did)) byDriver.set(did, inv);
    }

    const rows: DriverAccessStatus[] = (drivers ?? []).map((d) => {
      const dr = d as { id: string; user_id: string | null };
      const inv = byDriver.get(dr.id);
      return {
        driverId: dr.id,
        hasUserId: !!dr.user_id,
        inviteId: inv?.id ?? null,
        token: inv?.token ?? null,
        isActive: !!inv?.is_active,
        lastUsedAt: (inv as { last_used_at: string | null } | undefined)?.last_used_at ?? null,
      };
    });
    return rows;
  });

/**
 * Массовый выпуск invite-ссылок для всех водителей, у которых нет активной ссылки
 * и нет привязки drivers.user_id. Идемпотентен: повторный вызов не создаёт дублей.
 */
export const backfillDriverInvitesFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.userId);

    const { data: drivers, error: dErr } = await supabaseAdmin
      .from("drivers")
      .select("id, full_name, phone, user_id, is_active");
    if (dErr) throw new Error(dErr.message);

    const { data: invites, error: iErr } = await supabaseAdmin
      .from("invite_tokens")
      .select("driver_id, is_active")
      .eq("role", "driver");
    if (iErr) throw new Error(iErr.message);

    const hasActive = new Set<string>();
    for (const inv of invites ?? []) {
      const r = inv as { driver_id: string | null; is_active: boolean };
      if (r.driver_id && r.is_active) hasActive.add(r.driver_id);
    }

    const targets = (drivers ?? []).filter((d) => {
      const r = d as { id: string; user_id: string | null; is_active: boolean };
      return r.is_active && !r.user_id && !hasActive.has(r.id);
    });

    const created: InviteRow[] = [];
    const errors: Array<{ driverId: string; fullName: string; error: string }> = [];

    for (const d of targets) {
      const dr = d as { id: string; full_name: string; phone: string | null };
      try {
        const inv = await adminCreateInvite({
          fullName: dr.full_name,
          phone: dr.phone,
          role: "driver",
          driverId: dr.id,
          createdBy: context.userId,
        });
        created.push(inv);
        // Лёгкий throttle, чтобы не упереться в rate-limit Supabase Auth admin API.
        await new Promise((r) => setTimeout(r, 50));
      } catch (e) {
        errors.push({
          driverId: dr.id,
          fullName: dr.full_name,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      totalDrivers: (drivers ?? []).length,
      targetCount: targets.length,
      createdCount: created.length,
      errorCount: errors.length,
      errors,
    };
  });

/**
 * Назначить (или сменить) водителя у существующего маршрута.
 * Доступно admin / logist / manager. Без service role на публичной поверхности.
 * Обновляет одновременно delivery_routes.driver_id и delivery_routes.assigned_driver
 * (текстовое поле остаётся только для отображения).
 */
export const assignDriverToRouteFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((input: { deliveryRouteId: string; driverId: string }) => {
    if (!input?.deliveryRouteId) throw new Error("deliveryRouteId обязателен");
    if (!input?.driverId) throw new Error("driverId обязателен");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsStaff(context.userId);

    const { data: route, error: rErr } = await supabaseAdmin
      .from("delivery_routes")
      .select("id, driver_id, assigned_driver, carrier_id")
      .eq("id", data.deliveryRouteId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!route) throw new Error("Маршрут не найден");

    const { data: driver, error: dErr } = await supabaseAdmin
      .from("drivers")
      .select("id, full_name, carrier_id, is_active")
      .eq("id", data.driverId)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!driver) throw new Error("Водитель не найден");
    const dr = driver as { id: string; full_name: string; carrier_id: string; is_active: boolean };
    if (!dr.is_active) throw new Error("Водитель не активен");

    const updates: Record<string, unknown> = {
      driver_id: dr.id,
      assigned_driver: dr.full_name,
    };
    // Если у маршрута ещё нет carrier_id — подставим из водителя, чтобы RLS
    // водительских запросов /api/driver/* видела маршрут.
    if (!(route as { carrier_id: string | null }).carrier_id && dr.carrier_id) {
      updates.carrier_id = dr.carrier_id;
    }

    const { error: uErr } = await supabaseAdmin
      .from("delivery_routes")
      .update(updates as never)
      .eq("id", data.deliveryRouteId);
    if (uErr) throw new Error(uErr.message);

    return { ok: true, driverId: dr.id, fullName: dr.full_name };
  });
