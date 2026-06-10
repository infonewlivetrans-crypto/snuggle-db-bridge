import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const BUCKET = "dispatcher-documents";
const ALLOWED_ROLES = ["admin", "dispatcher"];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/octet-stream",
]);

export const Route = createFileRoute("/api/dispatcher/documents/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;

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

        const mime = file.type || "application/octet-stream";
        if (!ALLOWED_MIME.has(mime)) {
          return jsonResponse(
            { error: "Тип файла не поддерживается (jpg/png/webp/pdf)" },
            { status: 400 },
          );
        }
        const ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
        const path = `${ownerType}/${ownerId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await auth.client.storage
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
