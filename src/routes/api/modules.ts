import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

/** Включённые модули (system_settings.modules.enabled) — публичный read-only endpoint. */
export const Route = createFileRoute("/api/modules")({
  server: {
    handlers: {
      GET: async () => {
        const client = makeAnonClient();
        const { data, error } = await client
          .from("system_settings")
          .select("setting_value")
          .eq("setting_key", "modules.enabled")
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { modules: (data?.setting_value as Record<string, boolean> | null) ?? null },
          { headers: cacheHeaders(300, true) },
        );
      },
    },
  },
});
