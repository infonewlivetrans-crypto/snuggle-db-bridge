import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { documentCreateSchema } from "@/lib/dispatcher/documents";

// API документов для кабинета перевозчика.
// Перевозчик видит и добавляет документы только по своим объектам:
//  - carrier:  owner_id === dispatcherCarrierExtId
//  - driver:   dispatcher_driver_ext.id where dispatcher_carrier_ext_id = ctx
//  - vehicle:  dispatcher_vehicle_ext.id where dispatcher_carrier_ext_id = ctx
//
// Доступные статусы при создании: uploaded / checking.
// Менять на approved/rejected/expired/archived перевозчик не может.

const TABLE = "dispatcher_documents";
const SELECT =
  "id, owner_type, owner_id, document_type, title, file_path, file_name, file_mime, file_size, " +
  "document_status, comment, uploaded_by_type, uploaded_at, checked_by, checked_at, created_at, updated_at";

const CARRIER_ALLOWED_STATUSES = new Set(["uploaded", "checking"]);

type Ctx = Awaited<ReturnType<typeof resolveCarrierCtx>>;

async function checkOwnership(
  ctx: Exclude<Ctx, Response>,
  ownerType: string,
  ownerId: string,
): Promise<boolean> {
  if (ownerType === "carrier") {
    return ownerId === ctx.dispatcherCarrierExtId;
  }
  const table =
    ownerType === "driver"
      ? "dispatcher_driver_ext"
      : ownerType === "vehicle"
        ? "dispatcher_vehicle_ext"
        : null;
  if (!table) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (ctx.admin.from(table as never) as any)
    .select("id")
    .eq("id", ownerId)
    .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
    .maybeSingle();
  return !!data?.id;
}

export const Route = createFileRoute("/api/carrier/documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) {
          return jsonResponse({ ok: false, reason: "no_carrier_linked", rows: [] });
        }
        const url = new URL(request.url);
        const ownerType = url.searchParams.get("owner_type");
        const ownerId = url.searchParams.get("owner_id");
        if (!ownerType || !ownerId) {
          return jsonResponse({ error: "owner_type and owner_id required" }, { status: 400 });
        }
        const ok = await checkOwnership(ctx, ownerType, ownerId);
        if (!ok) return jsonResponse({ error: "forbidden" }, { status: 403 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.admin.from(TABLE as never) as any)
          .select(SELECT)
          .eq("owner_type", ownerType)
          .eq("owner_id", ownerId)
          .order("uploaded_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true, rows: data ?? [], total: (data ?? []).length });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;

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
        const ok = await checkOwnership(ctx, parsed.data.owner_type, parsed.data.owner_id);
        if (!ok) return jsonResponse({ error: "forbidden" }, { status: 403 });

        const status = parsed.data.document_status ?? "uploaded";
        if (!CARRIER_ALLOWED_STATUSES.has(status)) {
          return jsonResponse({ error: "status_not_allowed_for_carrier" }, { status: 403 });
        }

        const insertRow = {
          ...parsed.data,
          document_status: status,
          uploaded_by_type: "carrier",
          uploaded_by: auth.userId,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.admin.from(TABLE as never) as any)
          .insert(insertRow as unknown as never)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data });
      },
    },
  },
});
