// GET /api/inbound-signatures/history?inbound_document_id=...
// Возвращает историю подписей и signed URL для скачивания.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const BUCKET = "inbound-documents";

export const Route = createFileRoute("/api/inbound-signatures/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;
        const url = new URL(request.url);
        const inboundId = url.searchParams.get("inbound_document_id");
        const tripId = url.searchParams.get("trip_id");
        if (!inboundId && !tripId)
          return jsonResponse({ error: "missing_query" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = sb
          .from("dispatcher_document_signatures")
          .select("id, status, signed_at, signed_document_path, manual_signed_document_path")
          .order("created_at", { ascending: false });
        if (inboundId) q = q.eq("inbound_document_id", inboundId);
        if (tripId) q = q.eq("trip_id", tripId);
        const res = await q;
        if (res.error) return jsonResponse({ error: res.error.message }, { status: 500 });
        const rows = await Promise.all(
          (res.data ?? []).map(async (r: Record<string, unknown>) => {
            const signed = r.signed_document_path as string | null;
            const manual = r.manual_signed_document_path as string | null;
            const su = signed
              ? (await sb.storage.from(BUCKET).createSignedUrl(signed, 600)).data?.signedUrl ?? null
              : null;
            const mu = manual
              ? (await sb.storage.from(BUCKET).createSignedUrl(manual, 600)).data?.signedUrl ?? null
              : null;
            return {
              id: r.id,
              status: r.status,
              signed_at: r.signed_at,
              signed_url: su,
              manual_url: mu,
            };
          }),
        );
        return jsonResponse({ rows });
      },
    },
  },
});
