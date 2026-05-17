import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { getBackupDownloadUrl } from "@/server/backups.server";
import { makeAdminClient } from "@/server/api-helpers.server";
const supabaseAdmin = makeAdminClient();
export const Route = createFileRoute("/api/backups/$id/url")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          if (!params.id) return jsonResponse({ error: "id обязателен" }, { status: 400 });
          const { data: row, error } = await supabaseAdmin
            .from("backups").select("storage_path").eq("id", params.id).maybeSingle();
          if (error) throw new Error(error.message);
          const path = (row as { storage_path?: string | null } | null)?.storage_path;
          if (!path) return jsonResponse({ error: "Файл копии недоступен" }, { status: 404 });
          return jsonResponse({ url: await getBackupDownloadUrl(path, 300) });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
