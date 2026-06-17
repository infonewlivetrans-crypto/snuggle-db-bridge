import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/driver/trips/$tripId/documents")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;
        const tripId = params.tripId;

        let body: {
          kind?: string;
          storage_path?: string;
          point_id?: string | null;
          required?: boolean;
        };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "bad_json" }, { status: 400 });
        }
        if (!body.kind || !body.storage_path) {
          return jsonResponse({ error: "missing_fields" }, { status: 400 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (sb.from("dispatcher_trip_documents" as never) as any)
          .insert({
            trip_id: tripId,
            point_id: body.point_id ?? null,
            kind: body.kind,
            storage_path: body.storage_path,
            required: Boolean(body.required),
            uploaded_by: auth.userId,
          })
          .select("id, kind, storage_path, point_id, required, created_at")
          .maybeSingle();
        if (error) {
          console.error("[trip-documents] insert error", error);
          return jsonResponse({ error: error.message }, { status: 500 });
        }
        return jsonResponse({ document: data });
      },
    },
  },
});
