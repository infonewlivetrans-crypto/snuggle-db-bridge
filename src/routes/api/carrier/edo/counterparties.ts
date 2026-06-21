// API: список и создание контрагентов ЭДО (Этап 1).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import {
  listCounterparties,
  createCounterparty,
  type EdoCpVerificationStatus,
import {
  listCounterparties,
  createCounterparty,
  type EdoCpVerificationStatus,
  type EdoCpRole,
} from "@/server/edo/carrier-edo.server";

export const Route = createFileRoute("/api/carrier/edo/counterparties")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const allowed: EdoCpVerificationStatus[] = ["unknown", "verified", "not_found", "error"];
        try {
          const rows = await listCounterparties(ctx.client, ctx.dispatcherCarrierExtId, {
            search: url.searchParams.get("q"),
            verification_status:
              status && (allowed as string[]).includes(status)
                ? (status as EdoCpVerificationStatus)
                : null,
            include_archived: url.searchParams.get("archived") === "1",
          });
          return jsonResponse({ rows });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", message: e instanceof Error ? e.message : String(e) },
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
        try {
          const { id } = await createCounterparty(ctx.client, ctx.dispatcherCarrierExtId, {
            company_name: (body.company_name as string | null) ?? null,
            name: (body.name as string | null) ?? null,
            inn: (body.inn as string | null) ?? null,
            kpp: (body.kpp as string | null) ?? null,
            edo_operator: (body.edo_operator as string | null) ?? null,
            participant_id: (body.participant_id as string | null) ?? null,
            email: (body.email as string | null) ?? null,
            phone: (body.phone as string | null) ?? null,
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
    },
  },
});
