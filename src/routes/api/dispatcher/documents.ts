import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole, parseListParams } from "@/server/api-helpers.server";
import { documentCreateSchema, DOCUMENT_STATUSES } from "@/lib/dispatcher/documents";

const TABLE = "dispatcher_documents";
const ALLOWED_ROLES = ["admin", "dispatcher"];
const SELECT =
  "id, owner_type, owner_id, document_type, title, file_path, file_name, file_mime, file_size, " +
  "document_status, comment, uploaded_by_type, uploaded_at, checked_by, checked_at, created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const { limit, offset, url } = parseListParams(request);
        const ownerType = url.searchParams.get("owner_type");
        const ownerId = url.searchParams.get("owner_id");
        const documentType = url.searchParams.get("document_type");
        const status = url.searchParams.get("document_status");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any).select(SELECT, {
          count: "exact",
        });
        if (ownerType) q = q.eq("owner_type", ownerType);
        if (ownerId) q = q.eq("owner_id", ownerId);
        if (documentType) q = q.eq("document_type", documentType);
        if (status && status !== "all" && (DOCUMENT_STATUSES as readonly string[]).includes(status)) {
          q = q.eq("document_status", status);
        }
        q = q.order("uploaded_at", { ascending: false }).range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [], total: count ?? 0 });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = documentCreateSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            { error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}` },
            { status: 400 },
          );
        }
        const insertRow = {
          ...parsed.data,
          uploaded_by_type: "dispatcher",
          uploaded_by: auth.userId,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .insert(insertRow as unknown as never)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data });
      },
    },
  },
});
