// API: получить mock-QR водителя по document_id + отметить открытие.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { getQrForDocument, markQrOpened } from "@/server/edo/qr.server";

export const Route = createFileRoute("/api/driver/edo/documents/$id/qr")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const row = await getQrForDocument(auth.client, params.id);
          return jsonResponse({ row });
        } catch (e) {
          return jsonResponse(
            { error: "load_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          await markQrOpened(auth.client, params.id);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse(
            { error: "save_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
