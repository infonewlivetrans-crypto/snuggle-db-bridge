// POST /api/inbound-signatures/:id/manual-upload
// Принимает вручную подписанный документ (PDF/JPG/PNG/HEIC) и привязывает
// его к входящему документу. Если рейс уже создан — добавляет файл в
// dispatcher_trip_documents.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const BUCKET = "inbound-documents";
const MAX = 25 * 1024 * 1024;

export const Route = createFileRoute("/api/inbound-signatures/$id/manual-upload")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        let form: FormData;
        try { form = await request.formData(); } catch {
          return jsonResponse({ error: "bad_form" }, { status: 400 });
        }
        const file = form.get("file") as File | null;
        if (!file) return jsonResponse({ error: "file_required" }, { status: 400 });
        if (file.size > MAX) return jsonResponse({ error: "file_too_large" }, { status: 413 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docRes = await (sb.from("dispatcher_inbound_documents") as any)
          .select("id, carrier_ext_id, storage_path, dispatcher_trip_id")
          .eq("id", params.id)
          .maybeSingle();
        if (docRes.error || !docRes.data)
          return jsonResponse({ error: "not_found" }, { status: 404 });
        const doc = docRes.data as {
          id: string;
          carrier_ext_id: string;
          storage_path: string | null;
          dispatcher_trip_id: string | null;
        };

        const ext = extOf(file.name) || (file.type.includes("pdf") ? "pdf" : "bin");
        const path = `${doc.carrier_ext_id}/manual-signed/${doc.id}-${Date.now()}.${ext}`;
        const up = await sb.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (up.error) {
          console.error("[manual-upload] upload", up.error);
          return jsonResponse({ error: "upload_failed" }, { status: 500 });
        }

        const now = new Date().toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing: any = await sb
          .from("dispatcher_document_signatures")
          .select("id")
          .eq("inbound_document_id", doc.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {
          carrier_ext_id: doc.carrier_ext_id,
          inbound_document_id: doc.id,
          trip_id: doc.dispatcher_trip_id,
          source_document_path: doc.storage_path ?? path,
          manual_signed_document_path: path,
          status: "manual_uploaded",
          signed_by: auth.userId,
          signed_at: now,
        };
        if (existing.data?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("dispatcher_document_signatures") as any)
            .update(patch)
            .eq("id", existing.data.id);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("dispatcher_document_signatures") as any).insert(patch);
        }

        if (doc.dispatcher_trip_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("dispatcher_trip_documents") as any).insert({
            trip_id: doc.dispatcher_trip_id,
            kind: "signed_order",
            storage_path: path,
            uploaded_by: auth.userId,
          });
        }

        return jsonResponse({ ok: true, path });
      },
    },
  },
});

function extOf(name: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : null;
}
