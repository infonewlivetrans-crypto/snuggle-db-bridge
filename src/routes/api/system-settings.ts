import { createFileRoute } from "@tanstack/react-router";
import {
  jsonResponse,
  makeAnonClient,
  requireAuth,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/system-settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const settingKey = url.searchParams.get("setting_key");
        const client = makeAnonClient();
        let q = client
          .from("system_settings")
          .select("*")
          .order("category", { ascending: true })
          .order("setting_key", { ascending: true });
        if (settingKey) q = q.eq("setting_key", settingKey);
        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ settings: data ?? [] });
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        if (typeof body.setting_key !== "string" || !body.setting_key.trim())
          return jsonResponse({ error: "setting_key required" }, { status: 400 });
        const { data, error } = await auth.client
          .from("system_settings")
          .insert(body as never)
          .select("id")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ id: (data as { id: string } | null)?.id ?? null });
      },
    },
  },
});

