import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "../../server/audit.server";
import { getBackupDownloadUrl, listBackups, runBackup } from "../../server/backups.server";

async function getRoles(userId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.role));
}

async function getName(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("user_id", userId)
    .maybeSingle();
  return ((data as { full_name?: string | null } | null)?.full_name) ?? null;
}

export const listBackupsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.has("admin") && !roles.has("director")) {
      throw new Error("Нет доступа к резервным копиям");
    }
    return await listBackups(200);
  });

const CreateInput = z.object({ comment: z.string().max(500).optional().nullable() });

export const createBackupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.has("admin")) {
      throw new Error("Создавать резервные копии может только администратор");
    }
    const name = await getName(context.userId);
    const result = await runBackup({
      triggeredBy: context.userId,
      triggeredByName: name,
      triggerKind: "manual",
      comment: data.comment ?? null,
    });
    try {
      await writeAudit({
        userId: context.userId,
        userName: name,
        userRole: "admin",
        section: "backups",
        action: "create",
        objectType: "backup",
        objectId: result.id,
        objectLabel: result.storagePath,
        newValue: { size_bytes: result.sizeBytes, tables: result.tables },
      });
    } catch {
      // не валим бэкап из-за аудита
    }
    return result;
  });

const DownloadInput = z.object({ id: z.string().uuid() });

export const getBackupUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DownloadInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.has("admin")) {
      throw new Error("Скачивание доступно только администратору");
    }
    const { data: row, error } = await supabaseAdmin
      .from("backups")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const path = (row as { storage_path?: string | null } | null)?.storage_path;
    if (!path) throw new Error("Файл копии недоступен");
    return { url: await getBackupDownloadUrl(path, 300) };
  });

const RestoreInput = z.object({
  id: z.string().uuid(),
  confirm: z.string(),
});

export const restoreBackupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RestoreInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.has("admin")) {
      throw new Error("Восстановление доступно только администратору");
    }
    if (data.confirm !== "ВОССТАНОВИТЬ") {
      throw new Error("Подтверждение не совпадает. Введите ВОССТАНОВИТЬ.");
    }
    const name = await getName(context.userId);
    const { restoreFromBackup } = await import("../../server/backups.server");
    const result = await restoreFromBackup(data.id);
    try {
      await writeAudit({
        userId: context.userId,
        userName: name,
        userRole: "admin",
        section: "backups",
        action: "restore",
        objectType: "backup",
        objectId: data.id,
        objectLabel: data.id,
        newValue: { restored: result.restoredTables, skipped: result.skippedTables },
      });
    } catch {
      // ignore
    }
    return result;
  });
