import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { adminCreateInvite, type InviteRow } from "@/server/invites.server";
import { assertCallerHasAnyRole, assertCallerIsAdmin, requireAuthenticatedUserId } from "./auth.server";
import type { DriverAccessStatus } from "./driver-access.functions";

const STAFF_ROLES = ["admin", "logist", "manager"] as const;

export async function listDriverAccessStatus(): Promise<DriverAccessStatus[]> {
  const userId = await requireAuthenticatedUserId();
  await assertCallerHasAnyRole(userId, STAFF_ROLES);

  const { data: drivers, error: dErr } = await supabaseAdmin.from("drivers").select("id, user_id");
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

  return (drivers ?? []).map((d) => {
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
}

export async function backfillDriverInvites() {
  const userId = await requireAuthenticatedUserId();
  await assertCallerIsAdmin(userId);

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
        createdBy: userId,
      });
      created.push(inv);
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
}

export async function assignDriverToRoute(data: { deliveryRouteId: string; driverId: string }) {
  const userId = await requireAuthenticatedUserId();
  await assertCallerHasAnyRole(userId, STAFF_ROLES);

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
  if (!(route as { carrier_id: string | null }).carrier_id && dr.carrier_id) {
    updates.carrier_id = dr.carrier_id;
  }

  const { error: uErr } = await supabaseAdmin
    .from("delivery_routes")
    .update(updates as never)
    .eq("id", data.deliveryRouteId);
  if (uErr) throw new Error(uErr.message);

  return { ok: true, driverId: dr.id, fullName: dr.full_name };
}