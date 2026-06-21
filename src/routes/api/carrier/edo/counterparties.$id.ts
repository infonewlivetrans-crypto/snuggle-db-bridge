// API: одна карточка контрагента ЭДО (GET / PATCH / DELETE — soft archive).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import {
  getCounterparty,
  updateCounterparty,
  archiveCounterparty,
} from "@/server/edo/carrier-edo.server";

export const Route = createFileRoute("/api/carrier/edo/counterparties/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          const row = await getCounterparty(ctx.client, ctx.dispatcherCarrierExtId, params.id);
          if (!row) return jsonResponse({ error: "not_found" }, { status: 404 });
          return jsonResponse({ row });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          await updateCounterparty(ctx.client, ctx.dispatcherCarrierExtId, params.id, {
            company_name: (body.company_name as string | null) ?? null,
            name: (body.name as string | null) ?? null,
            inn: (body.inn as string | null) ?? null,
            kpp: (body.kpp as string | null) ?? null,
            edo_operator: (body.edo_operator as string | null) ?? null,
            participant_id: (body.participant_id as string | null) ?? null,
            email: (body.email as string | null) ?? null,
            phone: (body.phone as string | null) ?? null,
            contact_person: (body.contact_person as string | null) ?? null,
            address: (body.address as string | null) ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            role: (body.role as any) ?? null,
            comment: (body.comment as string | null) ?? null,
          });
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse(
            { error: "save_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        try {
          await archiveCounterparty(ctx.client, ctx.dispatcherCarrierExtId, params.id);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse(
            { error: "archive_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
