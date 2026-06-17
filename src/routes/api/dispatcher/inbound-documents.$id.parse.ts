import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { parseInboundAttachment } from "@/server/inbound/parser.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/inbound-documents/$id/parse")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = await (auth.client.from("dispatcher_inbound_documents") as any)
          .select("id, storage_bucket, storage_path, attachment_filename, attachment_mime_type")
          .eq("id", params.id)
          .maybeSingle();
        if (row.error || !row.data)
          return jsonResponse({ error: "not_found" }, { status: 404 });
        const dl = await auth.client.storage
          .from(row.data.storage_bucket as string)
          .download(row.data.storage_path as string);
        if (dl.error || !dl.data)
          return jsonResponse({ error: "download_failed" }, { status: 500 });
        const buf = Buffer.from(await dl.data.arrayBuffer());
        const res = await parseInboundAttachment(
          buf,
          row.data.attachment_mime_type as string | null,
          row.data.attachment_filename as string | null,
        );
        const status = res.needsReview ? "needs_review" : "parsed";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (auth.client.from("dispatcher_inbound_documents") as any)
          .update({
            extracted_text: res.text,
            parsed_payload: { fields: res.fields, missing: res.missing },
            parse_confidence: res.confidence,
            parse_warnings: res.warnings,
            document_kind: res.documentKind,
            processing_status: status,
          })
          .eq("id", params.id);
        return jsonResponse({ ok: true, status, ...res });
      },
    },
  },
});
