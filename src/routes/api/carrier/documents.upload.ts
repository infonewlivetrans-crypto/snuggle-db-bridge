import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

const BUCKET = "dispatcher-documents";
const MAX_SIZE = 20 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/octet-stream",
]);

type Ctx = Exclude<Awaited<ReturnType<typeof resolveCarrierCtx>>, Response>;

async function checkOwnership(ctx: Ctx, ownerType: string, ownerId: string): Promise<boolean> {
  if (ownerType === "carrier") return ownerId === ctx.dispatcherCarrierExtId;
  if (ownerType === "freight") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (ctx.admin.from("dispatcher_freights" as never) as any)
      .select("id")
      .eq("id", ownerId)
      .eq("assigned_carrier_ext_id", ctx.dispatcherCarrierExtId)
      .maybeSingle();
    return !!data?.id;
  }
  if (ownerType === "deal") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (ctx.admin.from("dispatcher_deals" as never) as any)
      .select("id")
      .eq("id", ownerId)
      .eq("carrier_id", ctx.dispatcherCarrierExtId)
      .maybeSingle();
    return !!data?.id;
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

export const Route = createFileRoute("/api/carrier/documents/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;

        const form = await request.formData().catch(() => null);
        if (!form) {
          return jsonResponse({ error: "expected multipart/form-data" }, { status: 400 });
        }
        const file = form.get("file");
        const ownerType = String(form.get("owner_type") ?? "").trim();
        const ownerId = String(form.get("owner_id") ?? "").trim();

        if (!(file instanceof File)) {
          return jsonResponse({ error: "Файл не передан" }, { status: 400 });
        }
        if (file.size > MAX_SIZE) {
          return jsonResponse({ error: "Файл слишком большой (макс 20 МБ)" }, { status: 400 });
        }
        if (!["carrier", "driver", "vehicle", "freight", "deal"].includes(ownerType)) {
          return jsonResponse({ error: "invalid owner_type" }, { status: 400 });
        }
        if (!/^[0-9a-f-]{36}$/i.test(ownerId)) {
          return jsonResponse({ error: "invalid owner_id" }, { status: 400 });
        }

        const ok = await checkOwnership(ctx, ownerType, ownerId);
        if (!ok) return jsonResponse({ error: "forbidden" }, { status: 403 });

        const mime = file.type || "application/octet-stream";
        if (!ALLOWED_MIME.has(mime)) {
          return jsonResponse(
            { error: "Тип файла не поддерживается (jpg/png/webp/pdf)" },
            { status: 400 },
          );
        }
        const ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
        const path = `${ownerType}/${ownerId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await ctx.admin.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false, contentType: mime });
        if (upErr) {
          return jsonResponse({ error: upErr.message }, { status: 500 });
        }

        return jsonResponse({
          file_path: path,
          file_name: file.name || path,
          file_mime: mime,
          file_size: file.size,
        });
      },
    },
  },
});
