import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/system-settings")({
  server: {
    handlers: {
      GET: async () => {
        const client = makeAnonClient();
        const { data, error } = await client
          .from("system_settings")
          .select("*")
          .order("category", { ascending: true })
          .order("setting_key", { ascending: true });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { settings: data ?? [] },
          { headers: { "cache-control": "public, max-age=600" } },
        );
      },

      PATCH: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        let body: {
          id?: string;
          setting_value?: unknown;
          description?: string;
        } = {};

        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Некорректный JSON" }, { status: 400 });
        }

        if (!body.id) {
          return jsonResponse({ error: "id обязателен" }, { status: 400 });
        }

        const patch: Record<string, unknown> = {
          setting_value: body.setting_value,
        };

        if (body.description !== undefined) {
          patch.description = body.description;
        }

        const { error } = await auth.client
          .from("system_settings")
          .update(patch as never)
          .eq("id", body.id);

        if (error) {
          return jsonResponse({ error: error.message }, { status: 500 });
        }

        return jsonResponse({ ok: true });
      },
    },
  },
});
