import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/inbound-documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (auth.client.from("dispatcher_inbound_documents") as any).select(
          "id, carrier_ext_id, email_from, email_subject, email_date, attachment_filename, document_kind, processing_status, parse_confidence, dispatcher_trip_id, dispatcher_deal_id, dispatcher_freight_id, created_at",
        );
        if (status) q = q.eq("processing_status", status);
        const res = await q.order("created_at", { ascending: false }).limit(200);
        if (res.error) return jsonResponse({ error: res.error.message }, { status: 500 });
        return jsonResponse({ rows: res.data ?? [] });
      },
    },
  },
});
