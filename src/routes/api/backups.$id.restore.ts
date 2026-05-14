import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { restoreFromBackup } from "@/server/backups.server";
import { writeAudit } from "@/server/audit.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getName(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  return ((data as { full_name?: string | null } | null)?.full_name) ?? null;
}

export const Route = createFileRoute("/api/backups/$id/restore")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          if (!params.id) return jsonResponse({ error: "id обязателен" }, { status: 400 });
          const body = (await request.json().catch(() => ({}))) as { confirm?: string };
          if (body?.confirm !== "ВОССТАНОВИТЬ") {
            return jsonResponse({ error: "Подтверждение не совпадает. Введите ВОССТАНОВИТЬ." }, { status: 400 });
          }
          const name = await getName(auth.userId);
          const result = await restoreFromBackup(params.id);
          try {
            await writeAudit({
              userId: auth.userId, userName: name, userRole: "admin",
              section: "backups", action: "restore",
              objectType: "backup", objectId: params.id, objectLabel: params.id,
              newValue: { restored: result.restoredTables, skipped: result.skippedTables },
            });
          } catch { /* ignore */ }
          return jsonResponse(result);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
