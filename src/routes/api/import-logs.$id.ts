import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/import-logs/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("import_log_rows")
          .select("*")
          .eq("import_log_id", params.id)
          .order("row_number", { ascending: true });
        if (error)
          return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        return jsonResponse(data ?? []);
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: { status?: string };
        try { body = await request.json(); }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        if (!body.status) return jsonResponse({ error: "status required" }, { status: 400 });
        const { error } = await auth.client
          .from("import_logs")
          .update({ status: body.status } as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
