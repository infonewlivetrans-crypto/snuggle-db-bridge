// API: одно изменение по рейсу (PATCH: смена статуса / правка).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { patchChange } from "@/server/edo/changes.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/changes/$changeId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          await patchChange(
            ctx.client,
            params.id,
            params.changeId,
            auth.userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body as any,
          );
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse(
            { error: "save_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
