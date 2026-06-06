import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { documentUpdateSchema } from "@/lib/dispatcher/documents";

const TABLE = "dispatcher_documents";
const ALLOWED_ROLES = ["admin", "dispatcher"];
const SELECT =
  "id, owner_type, owner_id, document_type, title, file_path, file_name, file_mime, file_size, " +
  "document_status, comment, uploaded_by_type, uploaded_at, checked_by, checked_at, created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/documents/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = documentUpdateSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            { error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}` },
            { status: 400 },
          );
        }
        const patch: Record<string, unknown> = { ...parsed.data };
        if (
          patch.document_status === "approved" ||
          patch.document_status === "rejected"
        ) {
          patch.checked_by = auth.userId;
          patch.checked_at = new Date().toISOString();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update(patch as unknown as never)
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // soft-delete -> archived
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (auth.client.from(TABLE as never) as any)
          .update({ document_status: "archived" } as unknown as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
