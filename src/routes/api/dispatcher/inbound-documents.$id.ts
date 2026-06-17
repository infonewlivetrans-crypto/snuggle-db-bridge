import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/inbound-documents/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (auth.client.from("dispatcher_inbound_documents") as any)
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (res.error) return jsonResponse({ error: res.error.message }, { status: 500 });
        if (!res.data) return jsonResponse({ error: "not_found" }, { status: 404 });

        let signedUrl: string | null = null;
        if (res.data.storage_bucket && res.data.storage_path) {
          const su = await auth.client.storage
            .from(res.data.storage_bucket as string)
            .createSignedUrl(res.data.storage_path as string, 600);
          signedUrl = su.data?.signedUrl ?? null;
        }
        return jsonResponse({ row: res.data, signedUrl });
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "bad_json" }, { status: 400 });
        }
        const patch: Record<string, unknown> = {};
        const allowed = [
          "parsed_payload",
          "processing_status",
          "dispatcher_deal_id",
          "dispatcher_freight_id",
          "dispatcher_trip_id",
          "document_kind",
          "parse_warnings",
        ];
        for (const k of allowed) if (k in body) patch[k] = body[k];
        if (Object.keys(patch).length === 0)
          return jsonResponse({ error: "nothing_to_update" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (auth.client.from("dispatcher_inbound_documents") as any)
          .update(patch)
          .eq("id", params.id)
          .select("id")
          .maybeSingle();
        if (res.error) return jsonResponse({ error: res.error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
