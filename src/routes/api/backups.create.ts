import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { runBackup } from "@/server/backups.server";
import { writeAudit } from "@/server/audit.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getName(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  return ((data as { full_name?: string | null } | null)?.full_name) ?? null;
}

export const Route = createFileRoute("/api/backups/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json().catch(() => ({}))) as { comment?: string | null };
          const name = await getName(auth.userId);
          const result = await runBackup({
            triggeredBy: auth.userId,
            triggeredByName: name,
            triggerKind: "manual",
            comment: body?.comment ?? null,
          });
          try {
            await writeAudit({
              userId: auth.userId,
              userName: name,
              userRole: "admin",
              section: "backups",
              action: "create",
              objectType: "backup",
              objectId: result.id,
              objectLabel: result.storagePath,
              newValue: { size_bytes: result.sizeBytes, tables: result.tables },
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
