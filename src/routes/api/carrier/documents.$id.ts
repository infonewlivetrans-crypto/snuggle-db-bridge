import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// PATCH /api/carrier/documents/$id — перевозчик правит только свои документы.
// Разрешено менять только title / comment / file_path / file_name и
// статус в пределах uploaded → checking.

const TABLE = "dispatcher_documents";
const SELECT =
  "id, owner_type, owner_id, document_type, title, file_path, file_name, file_mime, file_size, " +
  "document_status, comment, uploaded_by_type, uploaded_at, checked_by, checked_at, created_at, updated_at";

const CARRIER_ALLOWED_STATUSES = ["uploaded", "checking"] as const;

const nullableText = (max = 1000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v));

const patchSchema = z.object({
  title: nullableText(255),
  comment: nullableText(2000),
  file_path: nullableText(1024),
  file_name: nullableText(255),
  document_status: z.enum(CARRIER_ALLOWED_STATUSES).optional(),
});

export const Route = createFileRoute("/api/carrier/documents/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            { error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}` },
            { status: 400 },
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (ctx.admin.from(TABLE as never) as any)
          .select("id, owner_type, owner_id")
          .eq("id", params.id)
          .maybeSingle();
        if (!existing) return jsonResponse({ error: "not_found" }, { status: 404 });

        // Проверка владения по owner_type/owner_id текущего документа.
        const ownerType = existing.owner_type as string;
        const ownerId = existing.owner_id as string;
        let owned = false;
        if (ownerType === "carrier") {
          owned = ownerId === ctx.dispatcherCarrierExtId;
        } else if (ownerType === "driver" || ownerType === "vehicle") {
          const table =
            ownerType === "driver" ? "dispatcher_driver_ext" : "dispatcher_vehicle_ext";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (ctx.admin.from(table as never) as any)
            .select("id")
            .eq("id", ownerId)
            .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
            .maybeSingle();
          owned = !!data?.id;
        } else if (ownerType === "freight") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (ctx.admin.from("dispatcher_freights" as never) as any)
            .select("id")
            .eq("id", ownerId)
            .eq("assigned_carrier_ext_id", ctx.dispatcherCarrierExtId)
            .maybeSingle();
          owned = !!data?.id;
        } else if (ownerType === "deal") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (ctx.admin.from("dispatcher_deals" as never) as any)
            .select("id")
            .eq("id", ownerId)
            .eq("carrier_id", ctx.dispatcherCarrierExtId)
            .maybeSingle();
          owned = !!data?.id;
        }
        if (!owned) return jsonResponse({ error: "forbidden" }, { status: 403 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.admin.from(TABLE as never) as any)
          .update(parsed.data as unknown as never)
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },
    },
  },
});
