import { createServerFn } from "@tanstack/react-start";
import { requireCookieAuth } from "@/server/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "@/server/audit.server";
import { getRequest } from "@tanstack/react-start/server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Доступ запрещён: только администратор");
}

function reqMeta() {
  try {
    const req = getRequest();
    const ip =
      req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req?.headers?.get("x-real-ip") ||
      null;
    const ua = req?.headers?.get("user-agent") || null;
    return { ip, ua };
  } catch {
    return { ip: null, ua: null };
  }
}

async function getUserSnapshot(targetUserId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("user_id", targetUserId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", targetUserId),
  ]);
  if (!profile) throw new Error("Пользователь не найден");
  return {
    profile,
    roles: ((roles ?? []) as Array<{ role: string }>).map((r) => r.role),
  };
}

export const startImpersonationFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((input: { targetUserId: string }) => {
    if (!input?.targetUserId) throw new Error("targetUserId обязателен");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.targetUserId === context.userId) {
      throw new Error("Нельзя имперсонировать самого себя");
    }
    const snapshot = await getUserSnapshot(data.targetUserId);
    const { ip, ua } = reqMeta();

    // Получаем имя админа
    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();

    await writeAudit({
      userId: context.userId,
      userName: adminProfile?.full_name ?? adminProfile?.email ?? null,
      userRole: "admin",
      section: "impersonation",
      action: "start",
      objectType: "user",
      objectId: data.targetUserId,
      objectLabel: snapshot.profile.full_name ?? snapshot.profile.email ?? data.targetUserId,
      ipAddress: ip,
      userAgent: ua,
      details: { roles: snapshot.roles, mode: "read-only" },
    });

    return {
      targetUserId: data.targetUserId,
      profile: snapshot.profile,
      roles: snapshot.roles,
      startedAt: new Date().toISOString(),
    };
  });

export const stopImpersonationFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((input: { targetUserId: string; startedAt?: string }) => {
    if (!input?.targetUserId) throw new Error("targetUserId обязателен");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { ip, ua } = reqMeta();
    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", data.targetUserId)
      .maybeSingle();

    const durationMs = data.startedAt
      ? Date.now() - new Date(data.startedAt).getTime()
      : null;

    await writeAudit({
      userId: context.userId,
      userName: adminProfile?.full_name ?? adminProfile?.email ?? null,
      userRole: "admin",
      section: "impersonation",
      action: "stop",
      objectType: "user",
      objectId: data.targetUserId,
      objectLabel: targetProfile?.full_name ?? targetProfile?.email ?? data.targetUserId,
      ipAddress: ip,
      userAgent: ua,
      details: { durationMs },
    });
    return { ok: true };
  });
