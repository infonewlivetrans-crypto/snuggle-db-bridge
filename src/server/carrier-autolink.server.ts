// Авто-связка auth user → dispatcher_carrier_ext.
// Идея: пользователь НИКОГДА не нажимает кнопку "связать". Если он
// прошёл по ссылке /carrier/activate/:token (даже на другом устройстве,
// даже после подтверждения email), мы сами восстанавливаем связь.
//
// Сценарии:
//  (a) Уже есть активная запись в dispatcher_carrier_users — ничего не делаем.
//  (b) Токен claim_carrier_account_link уже отработал (carrier_account_links.used_by = user_id),
//      но строка dispatcher_carrier_users пропала / была заблокирована —
//      пересоздаём активную связь.
//  (c) Регистрация прошла, но claim ещё не был вызван (другой браузер,
//      пропал localStorage). При signUp мы кладём токен в
//      auth.user_metadata.carrier_activate_token. Здесь мы его подбираем,
//      валидируем токен и выполняем эквивалент claim_carrier_account_link.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AutolinkResult = { extId: string } | null;

interface LinkRow {
  id: string;
  dispatcher_carrier_ext_id: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  revoked_at: string | null;
  created_by: string | null;
}

async function getActiveLink(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (admin.from("dispatcher_carrier_users" as never) as any)
    .select("dispatcher_carrier_ext_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return (res?.data?.dispatcher_carrier_ext_id as string | undefined) ?? null;
}

async function activateLink(
  admin: SupabaseClient<Database>,
  userId: string,
  extId: string,
  createdBy: string | null,
): Promise<void> {
  // Блокируем все прошлые active записи этого user_id, чтобы не
  // нарушить unique (user_id) WHERE status='active'.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("dispatcher_carrier_users" as never) as any)
    .update({ status: "blocked" })
    .eq("user_id", userId)
    .eq("status", "active");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("dispatcher_carrier_users" as never) as any).insert({
    dispatcher_carrier_ext_id: extId,
    user_id: userId,
    status: "active",
    created_by: createdBy,
  });
  // Гарантируем роль carrier.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("user_roles" as never) as any)
    .upsert(
      { user_id: userId, role: "carrier" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
}

export async function ensureCarrierLink(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<AutolinkResult> {
  // (a) уже привязан
  const active = await getActiveLink(admin, userId);
  if (active) return { extId: active };

  // (b) токен уже использован этим пользователем — восстанавливаем связь
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byUsed = await (admin.from("carrier_account_links" as never) as any)
    .select("id, dispatcher_carrier_ext_id, expires_at, used_at, used_by, revoked_at, created_by")
    .eq("used_by", userId)
    .is("revoked_at", null)
    .order("used_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const usedRow = (byUsed?.data ?? null) as LinkRow | null;
  if (usedRow?.dispatcher_carrier_ext_id) {
    await activateLink(admin, userId, usedRow.dispatcher_carrier_ext_id, usedRow.created_by);
    return { extId: usedRow.dispatcher_carrier_ext_id };
  }

  // (c) токен лежит в user_metadata после signUp с email-подтверждением
  let pendingToken: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = await (admin.auth as any).admin.getUserById(userId);
    const meta = (u?.data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const t = meta?.carrier_activate_token;
    if (typeof t === "string" && t.length > 0) pendingToken = t;
  } catch {
    /* noop */
  }

  if (pendingToken) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokRes = await (admin.from("carrier_account_links" as never) as any)
      .select("id, dispatcher_carrier_ext_id, expires_at, used_at, used_by, revoked_at, created_by")
      .eq("token", pendingToken)
      .maybeSingle();
    const tok = (tokRes?.data ?? null) as LinkRow | null;
    const valid =
      tok &&
      !tok.revoked_at &&
      new Date(tok.expires_at).getTime() > Date.now() &&
      (!tok.used_at || tok.used_by === userId);
    if (valid && tok) {
      await activateLink(admin, userId, tok.dispatcher_carrier_ext_id, tok.created_by);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from("carrier_account_links" as never) as any)
        .update({ used_at: new Date().toISOString(), used_by: userId })
        .eq("id", tok.id);
      // Чистим метаданные, чтобы повторно не пытаться клеймить.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.auth as any).admin.updateUserById(userId, {
          user_metadata: { carrier_activate_token: null },
        });
      } catch {
        /* noop */
      }
      return { extId: tok.dispatcher_carrier_ext_id };
    }
  }

  return null;
}
