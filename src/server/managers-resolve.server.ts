// Резолвер менеджера для импорта маршрутного листа.
// - Ищет существующего менеджера по нормализованному ФИО.
// - Создаёт нового, если не найден (source = "route_sheet").
// - Идемпотентно создаёт invite роли "manager", если активного ещё нет.
// - Не дублирует менеджера и не дублирует invite-ссылку при повторных вызовах.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeFullName } from "@/lib/normalize-name";
import { normalizeRuPhone } from "@/lib/phone";
import { inviteUrl } from "@/lib/invite-url";
import {
  adminCreateInvite,
  findReusableManagerInvite,
  type InviteRow,
} from "./invites.server";

export type ResolvedManager = {
  id: string;
  fullName: string;
  phone: string | null;
  createdManager: boolean;
  inviteCreated: boolean;
  inviteUrl: string | null;
};

export async function resolveManagerForImport(args: {
  rawName: string | null | undefined;
  rawPhone?: string | null;
  userId?: string | null;
}): Promise<ResolvedManager | null> {
  const name = args.rawName?.trim();
  if (!name) return null;
  const norm = normalizeFullName(name);
  if (!norm) return null;
  const phone = normalizeRuPhone(args.rawPhone ?? null);

  // 1) Найти существующего по нормализованному ФИО (managers.normalized_name UNIQUE)
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("managers")
    .select("id, full_name, phone")
    .eq("normalized_name", norm)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  let managerId: string;
  let fullName: string;
  let storedPhone: string | null;
  let createdManager = false;

  if (existing) {
    const row = existing as { id: string; full_name: string; phone: string | null };
    managerId = row.id;
    fullName = row.full_name;
    storedPhone = row.phone;
    // Дозаполнить пустой телефон, не перетирая существующий
    if (!storedPhone && phone) {
      await supabaseAdmin
        .from("managers")
        .update({ phone } as never)
        .eq("id", managerId);
      storedPhone = phone;
    }
  } else {
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("managers")
      .insert({
        full_name: name,
        normalized_name: norm,
        phone,
        is_active: true,
        status: "active",
        source: "route_sheet",
        created_by: args.userId ?? null,
      } as never)
      .select("id, full_name, phone")
      .single();
    if (insErr || !ins) {
      throw new Error(insErr?.message ?? "Не удалось создать менеджера");
    }
    const row = ins as { id: string; full_name: string; phone: string | null };
    managerId = row.id;
    fullName = row.full_name;
    storedPhone = row.phone;
    createdManager = true;
  }

  // 2) Invite (идемпотентно).
  // Сначала ищем активный по manager_id, затем — по manager_name (fallback на старые записи).
  let invite: InviteRow | null = await findReusableManagerInvite(managerId);
  if (!invite) {
    const { data: byName, error: byNameErr } = await supabaseAdmin
      .from("invite_tokens")
      .select("*")
      .eq("role", "manager")
      .ilike("manager_name", fullName)
      .eq("is_active", true)
      .is("last_used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byNameErr) throw new Error(byNameErr.message);
    if (byName) {
      invite = byName as InviteRow;
      // Догоняющая привязка manager_id, если её ещё нет
      if (!(invite as { manager_id?: string | null }).manager_id) {
        await supabaseAdmin
          .from("invite_tokens")
          .update({ manager_id: managerId } as never)
          .eq("id", invite.id);
      }
    }
  }

  let inviteCreated = false;
  if (!invite) {
    try {
      invite = await adminCreateInvite({
        fullName,
        phone: storedPhone,
        role: "manager",
        managerName: fullName,
        createdBy: args.userId ?? null,
      });
      await supabaseAdmin
        .from("invite_tokens")
        .update({ manager_id: managerId } as never)
        .eq("id", invite.id);
      inviteCreated = true;
    } catch (e) {
      // Не блокируем импорт, если инвайт не удалось создать
      console.error("[managers-resolve] invite create failed", e);
    }
  }

  return {
    id: managerId,
    fullName,
    phone: storedPhone,
    createdManager,
    inviteCreated,
    inviteUrl: invite ? inviteUrl(invite.token) : null,
  };
}
