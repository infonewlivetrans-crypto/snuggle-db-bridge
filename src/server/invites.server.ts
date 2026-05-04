import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeRuPhone } from "@/lib/phone";

export type InviteRole = "admin" | "logist" | "manager" | "driver";
const ALLOWED_INVITE_ROLES: InviteRole[] = ["admin", "logist", "manager", "driver"];

const INVITE_EMAIL_DOMAIN = "invite.radius-track.local";

/** Случайный URL-safe токен (~22 символа). */
function generateToken(): string {
  // 16 байт энтропии = 128 бит, base64url без паддинга
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function inviteEmail(token: string): string {
  return `${token.toLowerCase()}@${INVITE_EMAIL_DOMAIN}`;
}

function randomPassword(): string {
  return generateToken() + generateToken();
}

export type CreateInviteArgs = {
  fullName: string;
  phone?: string | null;
  role: InviteRole;
  comment?: string | null;
  driverId?: string | null;
  managerName?: string | null;
  createdBy?: string | null;
};

export type InviteRow = {
  id: string;
  token: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  role: InviteRole;
  comment: string | null;
  driver_id: string | null;
  manager_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

/** Создание скрытого пользователя + invite-записи. */
export async function adminCreateInvite(args: CreateInviteArgs): Promise<InviteRow> {
  if (!args.fullName?.trim()) throw new Error("Укажите ФИО");
  if (!ALLOWED_INVITE_ROLES.includes(args.role)) {
    throw new Error("Инвайт-ссылки доступны для ролей: администратор, логист, менеджер, водитель");
  }

  const token = generateToken();
  const password = randomPassword();
  const email = inviteEmail(token);

  // 1) скрытый Supabase-пользователь
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: args.fullName,
      invite: true,
      role: args.role,
    },
  });
  if (createErr || !created.user) {
    throw new Error(createErr?.message ?? "Не удалось создать пользователя");
  }
  const userId = created.user.id;

  // 2) профиль (на случай, если триггер не сработал)
  await supabaseAdmin
    .from("profiles")
    .upsert(
      { user_id: userId, email, full_name: args.fullName, is_active: true },
      { onConflict: "user_id" },
    );

  // 3) роль
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: args.role });

  // 4) запись инвайта
  const phoneNorm = normalizeRuPhone(args.phone ?? null);
  const { data: inv, error: invErr } = await supabaseAdmin
    .from("invite_tokens")
    .insert({
      token,
      user_id: userId,
      full_name: args.fullName.trim(),
      phone: phoneNorm,
      role: args.role,
      comment: args.comment?.trim() || null,
      driver_id: args.driverId ?? null,
      manager_name: args.managerName?.trim() || null,
      is_active: true,
      created_by: args.createdBy ?? null,
    })
    .select("*")
    .single();
  if (invErr || !inv) {
    // откат пользователя, чтобы не оставить «висящего»
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw new Error(invErr?.message ?? "Не удалось создать инвайт");
  }

  return inv as InviteRow;
}

export async function adminListInvites(): Promise<InviteRow[]> {
  const { data, error } = await supabaseAdmin
    .from("invite_tokens")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InviteRow[];
}

export async function adminSetInviteActive(args: { id: string; isActive: boolean }) {
  const { error } = await supabaseAdmin
    .from("invite_tokens")
    .update({ is_active: args.isActive })
    .eq("id", args.id);
  if (error) throw new Error(error.message);

  // Заодно блокируем/разблокируем самого пользователя
  const { data: row } = await supabaseAdmin
    .from("invite_tokens")
    .select("user_id")
    .eq("id", args.id)
    .maybeSingle();
  if (row?.user_id) {
    await supabaseAdmin.auth.admin.updateUserById(row.user_id, {
      ban_duration: args.isActive ? "none" : "876000h",
    });
  }
}

/** Перевыпуск ссылки: меняем токен и одновременно сбрасываем пароль скрытого пользователя. */
export async function adminRotateInviteToken(args: { id: string }): Promise<InviteRow> {
  const { data: row, error: getErr } = await supabaseAdmin
    .from("invite_tokens")
    .select("*")
    .eq("id", args.id)
    .maybeSingle();
  if (getErr) throw new Error(getErr.message);
  if (!row) throw new Error("Инвайт не найден");

  const newToken = generateToken();
  const newPassword = randomPassword();
  const newEmail = inviteEmail(newToken);

  const { error: updUserErr } = await supabaseAdmin.auth.admin.updateUserById(
    (row as InviteRow).user_id,
    { email: newEmail, password: newPassword, email_confirm: true },
  );
  if (updUserErr) throw new Error(updUserErr.message);

  await supabaseAdmin
    .from("profiles")
    .update({ email: newEmail })
    .eq("user_id", (row as InviteRow).user_id);

  const { data: updated, error: updErr } = await supabaseAdmin
    .from("invite_tokens")
    .update({ token: newToken })
    .eq("id", args.id)
    .select("*")
    .single();
  if (updErr || !updated) throw new Error(updErr?.message ?? "Не удалось обновить токен");
  return updated as InviteRow;
}

export async function adminDeleteInvite(args: { id: string }) {
  const { data: row } = await supabaseAdmin
    .from("invite_tokens")
    .select("user_id")
    .eq("id", args.id)
    .maybeSingle();
  if (row?.user_id) {
    await supabaseAdmin.auth.admin.deleteUser(row.user_id).catch(() => undefined);
  }
  // CASCADE удалит запись invite_tokens; на всякий случай — явное удаление
  await supabaseAdmin.from("invite_tokens").delete().eq("id", args.id);
}

/** Информация по токену для страницы активации (без авторизации). */
export async function getInviteInfo(token: string): Promise<{
  fullName: string;
  role: InviteRole;
  alreadyActivated: boolean;
} | null> {
  if (!token || token.length < 8) return null;
  const { data, error } = await supabaseAdmin
    .from("invite_tokens")
    .select("full_name, role, is_active, last_used_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (!data.is_active) throw new Error("Ссылка отключена администратором");
  return {
    fullName: (data as { full_name: string }).full_name,
    role: (data as { role: InviteRole }).role,
    alreadyActivated: !!(data as { last_used_at: string | null }).last_used_at,
  };
}

/**
 * Активация инвайта реальным email + паролем.
 * Меняет email/password скрытого пользователя на введённые,
 * помечает invite как использованный и возвращает сессию.
 */
export async function activateInvite(args: {
  token: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  userId: string;
  role: InviteRole;
}> {
  const token = args.token?.trim();
  const email = args.email?.trim().toLowerCase();
  const password = args.password ?? "";
  const phoneRaw = (args.phone ?? "").trim();
  if (!token || token.length < 8) throw new Error("Некорректная ссылка");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Введите корректный email");
  if (password.length < 6) throw new Error("Пароль должен содержать минимум 6 символов");
  if (!phoneRaw) throw new Error("Введите номер телефона");
  const phoneNorm = normalizeRuPhone(phoneRaw);
  if (!phoneNorm) throw new Error("Введите корректный номер телефона");

  const { data: inv, error } = await supabaseAdmin
    .from("invite_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) throw new Error("Ссылка недействительна");
  const invite = inv as InviteRow;
  if (!invite.is_active) throw new Error("Ссылка отключена администратором");

  // Проверка занятости email
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .neq("user_id", invite.user_id)
    .maybeSingle();
  if (existingProfile) throw new Error("Этот email уже используется другим пользователем");

  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(invite.user_id, {
    email,
    password,
    email_confirm: true,
  });
  if (updErr) throw new Error(updErr.message);

  await supabaseAdmin
    .from("profiles")
    .update({ email, is_active: true })
    .eq("user_id", invite.user_id);

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const publicClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signErr } = await publicClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr || !signIn.session) {
    throw new Error(signErr?.message ?? "Не удалось войти после активации");
  }

  await supabaseAdmin
    .from("invite_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", invite.id);

  return {
    accessToken: signIn.session.access_token,
    refreshToken: signIn.session.refresh_token,
    userId: invite.user_id,
    role: invite.role,
  };
}
