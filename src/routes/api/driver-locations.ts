import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const Schema = z.object({
  delivery_route_id: z.string().uuid(),
  driver_name: z.string().max(255).nullable().optional(),
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nullable().optional(),
  captured_at: z.string().optional(),
});

export const Route = createFileRoute("/api/driver-locations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch {
          return jsonResponse({ error: "Некорректный JSON" }, { status: 400 });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success)
          return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const payload = {
          delivery_route_id: parsed.data.delivery_route_id,
          driver_name: parsed.data.driver_name ?? null,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
          accuracy: parsed.data.accuracy ?? null,
          captured_at: parsed.data.captured_at ?? new Date().toISOString(),
        };
        const { error } = await auth.client
          .from("driver_locations")
          .insert(payload as never);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
