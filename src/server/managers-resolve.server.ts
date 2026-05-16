// Резолвер менеджера для импорта маршрутного листа.
// - Поиск/создание менеджера выполняется через SECURITY DEFINER RPC
//   public.resolve_manager_for_route_sheet_import — это не требует
//   SUPABASE_SERVICE_ROLE_KEY и работает на обычном auth-клиенте
//   ролей admin/logist/manager.
// - Создание invite остаётся через supabaseAdmin (auth.admin.createUser),
//   но строго fail-safe: если invite упал — менеджер всё равно возвращается.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeFullName } from "@/lib/normalize-name";
import { normalizeRuPhone } from "@/lib/phone";
import { inviteUrl } from "@/lib/invite-url";
import {
  adminCreateInvite,
  findReusableManagerInvite,
  type InviteRow,
} from "./invites.server";

type DbClient = SupabaseClient<Database>;

export type ResolvedManager = {
  id: string;
  fullName: string;
  phone: string | null;
  createdManager: boolean;
  inviteCreated: boolean;
  inviteUrl: string | null;
};

export async function resolveManagerForImport(args: {
  sb: DbClient;
  rawName: string | null | undefined;
  rawPhone?: string | null;
  userId?: string | null;
}): Promise<ResolvedManager | null> {
  const name = args.rawName?.trim();
  if (!name) return null;
  const norm = normalizeFullName(name);
  if (!norm) return null;
  const phone = normalizeRuPhone(args.rawPhone ?? null);

  // 1) Найти/создать менеджера через RPC (без service_role).
  const { data: rpcData, error: rpcErr } = await args.sb.rpc(
    "resolve_manager_for_route_sheet_import",
    {
      p_full_name: name,
      p_normalized_name: norm,
      p_phone: phone,
      p_created_by: args.userId ?? null,
    } as never,
  );
  if (rpcErr) throw new Error(rpcErr.message);
  const row = Array.isArray(rpcData) ? (rpcData[0] as unknown) : (rpcData as unknown);
  if (!row) throw new Error("Не удалось получить менеджера");
  const r = row as {
    id: string;
    full_name: string;
    phone: string | null;
    created_manager: boolean;
  };
  const managerId = r.id;
  const fullName = r.full_name;
  const storedPhone = r.phone;
  const createdManager = !!r.created_manager;

  // 2) Invite — fail-safe. Любая ошибка ниже не должна срывать привязку
  //    orders.manager_id. Все операции с invite_tokens идут через supabaseAdmin
  //    и обёрнуты в общий try/catch.
  let invite: InviteRow | null = null;
  let inviteCreated = false;
  try {
    invite = await findReusableManagerInvite(managerId);
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
        if (!(invite as { manager_id?: string | null }).manager_id) {
          await supabaseAdmin
            .from("invite_tokens")
            .update({ manager_id: managerId } as never)
            .eq("id", invite.id);
        }
      }
    }
    if (!invite) {
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
    }
  } catch (e) {
    // Не блокируем импорт. Привязка orders.manager_id уже гарантирована RPC.
    console.error("[managers-resolve] invite step failed (non-fatal)", e);
    invite = null;
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
