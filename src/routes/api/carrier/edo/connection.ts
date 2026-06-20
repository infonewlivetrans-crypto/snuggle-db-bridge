import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import {
  listCarrierConnections,
  upsertCarrierConnection,
} from "@/server/edo/carrier-edo.server";
import type { EdoProvider } from "@/server/edo/providers/types";

async function handleUpsert(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const ctx = await resolveCarrierCtx(auth);
  if (ctx instanceof Response) return ctx;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const provider = (body.provider as EdoProvider) ?? "internal_mock";
  try {
    const { id } = await upsertCarrierConnection(ctx.client, ctx.dispatcherCarrierExtId, {
      id: (body.id as string | null) ?? null,
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
      is_default: body.is_default === true,
    });
    return jsonResponse({ id });
  } catch (e) {
    return jsonResponse(
      { error: "save_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

export const Route = createFileRoute("/api/carrier/edo/connection")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const connections = await listCarrierConnections(
            ctx.client, ctx.dispatcherCarrierExtId,
          );
          // Совместимость со старым клиентом: connection = основное.
          const primary = connections.find(c => c.is_default) ?? connections[0] ?? null;
          return jsonResponse({ connections, connection: primary });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", detail: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => handleUpsert(request),
      PATCH: async ({ request }) => handleUpsert(request),
    },
  },
});
