import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = ctx.client as any;
        const { data: doc, error } = await c
          .from("carrier_edo_documents")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!doc) return jsonResponse({ error: "not_found" }, { status: 404 });
        const { data: participants } = await c
          .from("carrier_edo_document_participants")
          .select("*")
          .eq("document_id", params.id)
          .order("role");
        const { data: events } = await c
          .from("carrier_edo_document_events")
          .select("*")
          .eq("document_id", params.id)
          .order("created_at", { ascending: false })
          .limit(200);
        return jsonResponse({
          document: doc,
          participants: participants ?? [],
          events: events ?? [],
        });
      },
    },
  },
});
