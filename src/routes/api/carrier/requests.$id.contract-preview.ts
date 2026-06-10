import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { loadCarrierRequestContractPreview } from "@/lib/dispatcher/carrier-request-contract.server";

export const Route = createFileRoute(
  "/api/carrier/requests/$id/contract-preview",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;
        const res = await loadCarrierRequestContractPreview(
          ctx.admin,
          params.id,
          {
            hideCommission: false,
            carrierExtIdScope: ctx.dispatcherCarrierExtId,
          },
        );
        if (!res.ok)
          return jsonResponse({ error: res.error }, { status: res.status });
        return jsonResponse(res);
      },
    },
  },
});
