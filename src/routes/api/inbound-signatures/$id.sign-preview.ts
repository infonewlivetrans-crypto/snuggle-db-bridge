// POST /api/inbound-signatures/:id/sign-preview
// На входе :id — это dispatcher_inbound_documents.id.
// Возвращает предложенное размещение печати/подписи перевозчика и
// метаданные PDF (число страниц, размер первой страницы).
// Если автоматически не нашли якоря — возвращает needs_manual_placement=true.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const BUCKET = "inbound-documents";

export const Route = createFileRoute("/api/inbound-signatures/$id/sign-preview")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docRes = await (sb.from("dispatcher_inbound_documents") as any)
          .select("id, carrier_ext_id, storage_bucket, storage_path, extracted_text, attachment_mime_type")
          .eq("id", params.id)
          .maybeSingle();
        if (docRes.error || !docRes.data)
          return jsonResponse({ error: "not_found" }, { status: 404 });
        const doc = docRes.data as {
          id: string;
          carrier_ext_id: string;
          storage_bucket: string | null;
          storage_path: string | null;
          extracted_text: string | null;
          attachment_mime_type: string | null;
        };
        if (!doc.storage_path) return jsonResponse({ error: "no_file" }, { status: 400 });
        const mime = (doc.attachment_mime_type ?? "").toLowerCase();
        if (mime && !mime.includes("pdf")) {
          return jsonResponse(
            { error: "not_pdf", message: "Автоматическая подпись поддерживается только для PDF. Загрузите подписанный документ вручную." },
            { status: 400 },
          );
        }

        // Активный набор печати/подписи перевозчика.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aRes = await (sb.from("carrier_signature_assets") as any)
          .select("id, stamp_file_path, signature_file_path")
          .eq("carrier_ext_id", doc.carrier_ext_id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (aRes.error || !aRes.data) {
          return jsonResponse(
            { error: "no_signature_asset", message: "Печать и подпись перевозчика не настроены" },
            { status: 400 },
          );
        }

        // Имя/ИНН перевозчика для поиска якоря.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cRes = await (sb.from("dispatcher_carrier_ext") as any)
          .select("name, inn")
          .eq("id", doc.carrier_ext_id)
          .maybeSingle();
        const cName = cRes.data?.name ?? null;
        const cInn = cRes.data?.inn ?? null;

        const dl = await sb.storage.from(doc.storage_bucket ?? BUCKET).download(doc.storage_path);
        if (dl.error || !dl.data) {
          return jsonResponse({ error: "download_failed" }, { status: 500 });
        }
        const buf = new Uint8Array(await dl.data.arrayBuffer());

        const { getPdfMeta, findCarrierPage } = await import("@/server/signatures/pdf-sign.server");
        let meta: { pageCount: number; firstPage: { w: number; h: number } };
        try {
          meta = await getPdfMeta(buf);
        } catch (e) {
          console.error("[sign-preview] pdf parse", e);
          return jsonResponse({ error: "bad_pdf" }, { status: 400 });
        }

        const anchor = findCarrierPage(doc.extracted_text, cName, cInn, meta.pageCount);

        // Дефолтное размещение: правый нижний угол страницы.
        const pw = meta.firstPage.w;
        const ph = meta.firstPage.h;
        const stampW = Math.round(Math.min(160, pw * 0.25));
        const sigW = Math.round(Math.min(160, pw * 0.25));
        const margin = 36;
        const placement = {
          page: anchor.page,
          stamp: { x: pw - stampW - margin, y: ph - stampW - margin, w: stampW },
          signature: { x: pw - sigW - margin - stampW - 8, y: ph - sigW * 0.5 - margin, w: sigW },
        };

        return jsonResponse({
          ok: true,
          needs_manual_placement: anchor.needsManual,
          reason: anchor.reason ?? null,
          placement,
          pdf: { page_count: meta.pageCount, first_page: meta.firstPage },
          signature_asset_id: aRes.data.id,
        });
      },
    },
  },
});
