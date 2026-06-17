// POST /api/inbound-signatures/:id/sign-confirm
// Принимает placement, вставляет печать и подпись в PDF, сохраняет отдельным
// файлом (оригинал не трогаем) и upsert'ит dispatcher_document_signatures.
// Если у документа уже есть привязанный рейс — добавляет signed PDF в
// dispatcher_trip_documents.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import type { Placement } from "@/lib/signatures/types";

const BUCKET = "inbound-documents";

interface Body {
  placement: Placement;
  signature_asset_id?: string | null;
}

export const Route = createFileRoute("/api/inbound-signatures/$id/sign-confirm")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        let body: Body;
        try { body = await request.json(); } catch {
          return jsonResponse({ error: "bad_json" }, { status: 400 });
        }
        const p = body.placement;
        if (!p || typeof p.page !== "number" || !p.stamp || !p.signature) {
          return jsonResponse({ error: "bad_placement" }, { status: 400 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docRes = await (sb.from("dispatcher_inbound_documents") as any)
          .select("id, carrier_ext_id, storage_bucket, storage_path, dispatcher_trip_id")
          .eq("id", params.id)
          .maybeSingle();
        if (docRes.error || !docRes.data)
          return jsonResponse({ error: "not_found" }, { status: 404 });
        const doc = docRes.data as {
          id: string;
          carrier_ext_id: string;
          storage_bucket: string | null;
          storage_path: string;
          dispatcher_trip_id: string | null;
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let assetQ: any = sb
          .from("carrier_signature_assets")
          .select("id, stamp_file_path, signature_file_path")
          .eq("carrier_ext_id", doc.carrier_ext_id);
        if (body.signature_asset_id) assetQ = assetQ.eq("id", body.signature_asset_id);
        else assetQ = assetQ.eq("is_active", true);
        const aRes = await assetQ.order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (aRes.error || !aRes.data?.stamp_file_path || !aRes.data?.signature_file_path) {
          return jsonResponse(
            { error: "no_signature_asset", message: "Печать и подпись перевозчика не найдены" },
            { status: 400 },
          );
        }

        const bucket = doc.storage_bucket ?? BUCKET;
        const [src, stampDl, sigDl] = await Promise.all([
          sb.storage.from(bucket).download(doc.storage_path),
          sb.storage.from(BUCKET).download(aRes.data.stamp_file_path),
          sb.storage.from(BUCKET).download(aRes.data.signature_file_path),
        ]);
        if (src.error || !src.data) return jsonResponse({ error: "src_download_failed" }, { status: 500 });
        if (stampDl.error || !stampDl.data || sigDl.error || !sigDl.data)
          return jsonResponse({ error: "asset_download_failed" }, { status: 500 });

        const pdfBuf = new Uint8Array(await src.data.arrayBuffer());
        const stampPng = new Uint8Array(await stampDl.data.arrayBuffer());
        const sigPng = new Uint8Array(await sigDl.data.arrayBuffer());

        const { signPdf } = await import("@/server/signatures/pdf-sign.server");
        let signedPdf: Uint8Array;
        try {
          signedPdf = await signPdf({ sourcePdf: pdfBuf, stampPng, signaturePng: sigPng, placement: p });
        } catch (e) {
          console.error("[sign-confirm] signPdf", e);
          return jsonResponse({ error: "sign_failed", message: String(e) }, { status: 500 });
        }

        const signedPath = `${doc.carrier_ext_id}/signed/${doc.id}-${Date.now()}.pdf`;
        const up = await sb.storage
          .from(BUCKET)
          .upload(signedPath, signedPdf, { contentType: "application/pdf", upsert: false });
        if (up.error) {
          console.error("[sign-confirm] upload", up.error);
          return jsonResponse({ error: "upload_failed" }, { status: 500 });
        }

        // Upsert dispatcher_document_signatures.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing: any = await sb
          .from("dispatcher_document_signatures")
          .select("id")
          .eq("inbound_document_id", doc.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const now = new Date().toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {
          carrier_ext_id: doc.carrier_ext_id,
          inbound_document_id: doc.id,
          trip_id: doc.dispatcher_trip_id,
          source_document_path: doc.storage_path,
          signed_document_path: signedPath,
          signature_asset_id: aRes.data.id,
          placement: p as unknown as Record<string, unknown>,
          status: "signed",
          signed_by: auth.userId,
          signed_at: now,
        };
        let sigRowId: string | null = null;
        if (existing.data?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const upd = await (sb.from("dispatcher_document_signatures") as any)
            .update(patch)
            .eq("id", existing.data.id)
            .select("id")
            .maybeSingle();
          if (upd.error) {
            console.error("[sign-confirm] update sig", upd.error);
            return jsonResponse({ error: upd.error.message }, { status: 500 });
          }
          sigRowId = upd.data?.id ?? existing.data.id;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ins = await (sb.from("dispatcher_document_signatures") as any)
            .insert(patch)
            .select("id")
            .maybeSingle();
          if (ins.error) {
            console.error("[sign-confirm] insert sig", ins.error);
            return jsonResponse({ error: ins.error.message }, { status: 500 });
          }
          sigRowId = ins.data?.id ?? null;
        }

        // Если рейс уже создан — прикрепить подписанный PDF.
        if (doc.dispatcher_trip_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("dispatcher_trip_documents") as any).insert({
            trip_id: doc.dispatcher_trip_id,
            kind: "signed_order",
            storage_path: signedPath,
            uploaded_by: auth.userId,
          });
        }

        return jsonResponse({ ok: true, signed_path: signedPath, signature_id: sigRowId });
      },
    },
  },
});
