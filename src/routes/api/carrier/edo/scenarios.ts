// API: список и создание ЭПД-сценариев.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { listScenarios, createScenario } from "@/server/edo/scenarios.server";
import type { EpdScenarioType, ForwarderPossessionMode, CargoHolderRole } from "@/lib/edo/scenarios";

export const Route = createFileRoute("/api/carrier/edo/scenarios")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const url = new URL(request.url);
        try {
          const rows = await listScenarios(ctx.client, ctx.dispatcherCarrierExtId, {
            trip_id: url.searchParams.get("trip_id"),
            document_id: url.searchParams.get("document_id"),
          });
          return jsonResponse({ rows });
        } catch (e) {
          return jsonResponse({ error: "load_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          const { id } = await createScenario(ctx.client, ctx.dispatcherCarrierExtId, ctx.userId, {
            scenario_type: body.scenario_type as EpdScenarioType,
            trip_id: (body.trip_id as string) ?? null,
            deal_id: (body.deal_id as string) ?? null,
            document_id: (body.document_id as string) ?? null,
            forwarder_id: (body.forwarder_id as string) ?? null,
            forwarder_possession_mode: (body.forwarder_possession_mode as ForwarderPossessionMode) ?? null,
            cargo_holder_role: (body.cargo_holder_role as CargoHolderRole) ?? null,
            participants: (body.participants as Record<string, unknown>) ?? {},
            is_training: Boolean(body.is_training),
          });
          return jsonResponse({ id });
        } catch (e) {
          return jsonResponse({ error: "save_failed", message: e instanceof Error ? e.message : String(e) }, { status: 400 });
        }
      },
    },
  },
});
