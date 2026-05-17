import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";
import { distanceMatrix } from "@/server/yandex.server";

const PointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
const BodySchema = z.object({
  origins: z.array(PointSchema).min(1).max(50),
  destinations: z.array(PointSchema).min(1).max(50),
});

export const Route = createFileRoute("/api/routing/matrix")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid json" }, { status: 400 });
        }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ error: "invalid body" }, { status: 400 });
        }
        try {
          const matrix = await distanceMatrix(auth.client, parsed.data.origins, parsed.data.destinations);
          return jsonResponse({ matrix }, { headers: cacheHeaders(3600) });
        } catch (e) {
          return jsonResponse(
            { error: e instanceof Error ? e.message : "matrix_failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
