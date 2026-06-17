import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/carrier/inbound-documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (auth.client.from("dispatcher_inbound_documents") as any)
          .select(
            "id, email_from, email_subject, email_date, attachment_filename, document_kind, processing_status, parse_confidence, dispatcher_trip_id, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(100);
        if (res.error) return jsonResponse({ error: res.error.message }, { status: 500 });
        return jsonResponse({ rows: res.data ?? [] });
      },
    },
  },
});
