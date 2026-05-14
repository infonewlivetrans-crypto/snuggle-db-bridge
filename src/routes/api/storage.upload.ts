import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const ALLOWED_BUCKETS = new Set(["delivery-photos"]);

export const Route = createFileRoute("/api/storage/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const form = await request.formData().catch(() => null);
        if (!form) return jsonResponse({ error: "Ожидался multipart/form-data" }, { status: 400 });
        const bucket = String(form.get("bucket") ?? "");
        const file = form.get("file");
        if (!ALLOWED_BUCKETS.has(bucket)) return jsonResponse({ error: "Bucket не разрешён" }, { status: 400 });
        if (!(file instanceof File)) return jsonResponse({ error: "Файл не передан" }, { status: 400 });
        if (file.size > 20 * 1024 * 1024) return jsonResponse({ error: "Файл слишком большой (макс 20МБ)" }, { status: 400 });
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 8);
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await auth.client.storage
          .from(bucket)
          .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
        if (upErr) return jsonResponse({ error: upErr.message }, { status: 500 });
        const { data } = auth.client.storage.from(bucket).getPublicUrl(path);
        return jsonResponse({ path, public_url: data.publicUrl });
      },
    },
  },
});
