import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  makeAnonClient,
  requireUser,
} from "@/server/api-helpers.server";

/** Состояние демо-режима + счётчики заказов/маршрутов. */
export const Route = createFileRoute("/api/demo-mode")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const anon = makeAnonClient();
        const settingP = anon
          .from("system_settings")
          .select("setting_value")
          .eq("setting_key", "demo_mode_enabled")
          .maybeSingle();

        const token = getBearerToken(request);
        const auth = token ? await requireUser(token) : null;
        const client = auth?.client ?? anon;

        const [settingRes, ordersRes, routesRes] = await Promise.all([
          settingP,
          client.from("orders").select("id", { count: "exact", head: true }),
          client.from("routes").select("id", { count: "exact", head: true }),
        ]);

        const raw = settingRes.data?.setting_value as unknown;
        const enabled =
          raw === true ||
          raw === "true" ||
          (typeof raw === "object" &&
            raw !== null &&
            (raw as { enabled?: boolean }).enabled === true);

        return jsonResponse(
          {
            isDemo: Boolean(enabled),
            ordersCount: ordersRes.count ?? 0,
            routesCount: routesRes.count ?? 0,
          },
          { headers: cacheHeaders(300) },
        );
      },
    },
  },
});
