import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AppRole } from "@/lib/auth/roles";

export async function hasAnyAdmin(): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function bootstrapFirstAdmin(args: {
  email: string;
  password: string;
  fullName: string;
}) {
  // Защита от гонки: если админ уже есть — отказать
  if (await hasAnyAdmin()) {
    throw new Error("Администратор уже создан");
  }
  return adminCreateUser({ ...args, role: "admin" });
}

export async function assertCallerIsAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Доступ запрещён: требуется роль администратора");
}

export async function adminCreateUser(args: {
  email: string;
  password: string;
  fullName: string;
  role: AppRole;
}) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
    user_metadata: { full_name: args.fullName },
  });
  if (error) throw new Error(error.message);
  const newUserId = data.user!.id;

  // Профиль создаётся триггером, но обновим ФИО на всякий случай
  await supabaseAdmin
    .from("profiles")
    .upsert(
      { user_id: newUserId, email: args.email, full_name: args.fullName, is_active: true },
      { onConflict: "user_id" },
    );

  await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: newUserId, role: args.role });

  return { userId: newUserId };
}

export async function adminSetUserRole(args: { userId: string; role: AppRole }) {
  await supabaseAdmin.from("user_roles").delete().eq("user_id", args.userId);
  const { error } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: args.userId, role: args.role });
  if (error) throw new Error(error.message);
}

export async function adminSetUserRoles(args: { userId: string; roles: AppRole[] }) {
  const unique = Array.from(new Set(args.roles));
  if (unique.length === 0) throw new Error("Должна быть хотя бы одна роль");
  await supabaseAdmin.from("user_roles").delete().eq("user_id", args.userId);
  const rows = unique.map((role) => ({ user_id: args.userId, role }));
  const { error } = await supabaseAdmin.from("user_roles").insert(rows);
  if (error) throw new Error(error.message);
}

export async function adminSetUserActive(args: { userId: string; isActive: boolean }) {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ is_active: args.isActive })
    .eq("user_id", args.userId);
  if (error) throw new Error(error.message);

  // Заблокированному запретим вход через ban_duration
  await supabaseAdmin.auth.admin.updateUserById(args.userId, {
    ban_duration: args.isActive ? "none" : "876000h",
  });
}

export async function adminListUsers() {
  const [
    { data: profiles, error: pErr },
    { data: roles, error: rErr },
    { data: invites, error: iErr },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("user_roles").select("user_id, role"),
    supabaseAdmin
      .from("invite_tokens")
      .select("id, token, user_id, full_name, phone, role, comment, is_active, last_used_at, created_at")
      .order("created_at", { ascending: false }),
  ]);
  if (pErr) throw new Error(pErr.message);
  if (rErr) throw new Error(rErr.message);
  if (iErr) throw new Error(iErr.message);

  const rolesByUser = new Map<string, AppRole[]>();
  for (const r of (roles ?? []) as { user_id: string; role: AppRole }[]) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  }

  // Карта инвайтов по user_id (для пометки статуса invited)
  const inviteByUser = new Map<
    string,
    { token: string; is_active: boolean; last_used_at: string | null; phone: string | null; comment: string | null }
  >();
  for (const inv of (invites ?? []) as Array<{
    user_id: string;
    token: string;
    is_active: boolean;
    last_used_at: string | null;
    phone: string | null;
    comment: string | null;
  }>) {
    if (!inviteByUser.has(inv.user_id)) {
      inviteByUser.set(inv.user_id, inv);
    }
  }

  return ((profiles ?? []) as Array<{
    id: string;
    user_id: string;
    full_name: string | null;
    email: string | null;
    is_active: boolean;
    created_at: string;
  }>).map((p) => {
    const inv = inviteByUser.get(p.user_id);
    // Считаем «приглашённым», если у профиля есть активная invite-ссылка и она ещё не использовалась
    const isInvited = !!inv && inv.is_active && !inv.last_used_at;
    return {
      ...p,
      roles: rolesByUser.get(p.user_id) ?? [],
      phone: inv?.phone ?? null,
      comment: inv?.comment ?? null,
      status: isInvited ? "invited" : p.is_active ? "active" : "blocked",
      invite_token: inv?.token ?? null,
      invite_active: inv?.is_active ?? null,
    };
  });
}
