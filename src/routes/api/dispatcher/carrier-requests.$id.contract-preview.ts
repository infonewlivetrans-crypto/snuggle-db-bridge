import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { loadCarrierRequestContractPreview } from "@/lib/dispatcher/carrier-request-contract.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute(
  "/api/dispatcher/carrier-requests/$id/contract-preview",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const res = await loadCarrierRequestContractPreview(
          auth.client,
          params.id,
          { hideCommission: false },
        );
        if (!res.ok)
          return jsonResponse({ error: res.error }, { status: res.status });
        return jsonResponse(res);
      },
    },
  },
});
