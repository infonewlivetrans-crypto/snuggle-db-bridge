import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import {
  getCarrierConnectionSafe,
  upsertCarrierConnection,
} from "@/server/edo/carrier-edo.server";
import type { EdoProvider } from "@/server/edo/providers/types";

export const Route = createFileRoute("/api/carrier/edo/connection")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const conn = await getCarrierConnectionSafe(ctx.client, ctx.dispatcherCarrierExtId);
          return jsonResponse({ connection: conn });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", detail: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const provider = (body.provider as EdoProvider) ?? "internal_mock";
        try {
          const { id } = await upsertCarrierConnection(ctx.client, ctx.dispatcherCarrierExtId, {
            provider,
            environment: (body.environment as "test" | "production") ?? "test",
            organization_name: (body.organization_name as string | null) ?? null,
            organization_inn: (body.organization_inn as string | null) ?? null,
            external_org_id: (body.external_org_id as string | null) ?? null,
            box_id: (body.box_id as string | null) ?? null,
            client_id: (body.client_id as string | null) ?? null,
            client_secret: (body.client_secret as string | null) ?? null,
            api_key: (body.api_key as string | null) ?? null,
            access_token: (body.access_token as string | null) ?? null,
            refresh_token: (body.refresh_token as string | null) ?? null,
            certificate_id: (body.certificate_id as string | null) ?? null,
            comment: (body.comment as string | null) ?? null,
          });
          return jsonResponse({ id });
        } catch (e) {
          return jsonResponse(
            { error: "save_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
      PATCH: async (ctx) => {
        // PATCH = тот же upsert.
        return new Response(null, { status: 307, headers: { location: "/api/carrier/edo/connection" } }) as never ?? ctx;
      },
    },
  },
});
