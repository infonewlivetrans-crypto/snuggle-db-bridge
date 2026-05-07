import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/api-helpers.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "route-point-photos";
const ALLOWED_KINDS = new Set(["qr", "signed_docs", "payment", "problem", "unloading_place"]);
const MAX_BYTES = 20 * 1024 * 1024;

export const Route = createFileRoute("/api/route-point-photos/offline-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth: only authenticated users (driver). Validate bearer via admin client.
        const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
        const token = authHeader?.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : null;
        if (!token) return jsonResponse({ error: "Unauthorized" }, { status: 401 });
        const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userData.user) {
          return jsonResponse({ error: "Unauthorized" }, { status: 401 });
        }

        const form = await request.formData().catch(() => null);
        if (!form) return jsonResponse({ error: "Ожидался multipart/form-data" }, { status: 400 });

        const clientUploadId = String(form.get("client_upload_id") ?? "").trim();
        const routePointId = String(form.get("route_point_id") ?? "").trim();
        const orderIdRaw = form.get("order_id");
        const orderId = orderIdRaw && String(orderIdRaw).trim() ? String(orderIdRaw).trim() : null;
        const kind = String(form.get("kind") ?? "").trim();
        const actor = form.get("actor") ? String(form.get("actor")) : null;
        const deviceCreatedAt = form.get("device_created_at")
          ? String(form.get("device_created_at"))
          : null;
        const file = form.get("file");

        if (!clientUploadId || clientUploadId.length > 128) {
          return jsonResponse({ error: "client_upload_id обязателен" }, { status: 400 });
        }
        if (!/^[a-zA-Z0-9_\-:.]+$/.test(clientUploadId)) {
          return jsonResponse({ error: "client_upload_id содержит недопустимые символы" }, { status: 400 });
        }
        if (!routePointId) return jsonResponse({ error: "route_point_id обязателен" }, { status: 400 });
        if (!ALLOWED_KINDS.has(kind)) {
          return jsonResponse({ error: "kind недопустим" }, { status: 400 });
        }

        // Идемпотентность: если уже принято — вернуть предыдущий результат.
        const { data: existing } = await supabaseAdmin
          .from("route_point_photo_uploads")
          .select("id, status, storage_path, file_url, error")
          .eq("client_upload_id", clientUploadId)
          .maybeSingle();
        if (existing && existing.status === "uploaded") {
          return jsonResponse({
            ok: true,
            duplicate: true,
            file_url: existing.file_url,
            storage_path: existing.storage_path,
          });
        }

        if (!(file instanceof File)) {
          return jsonResponse({ error: "Файл не передан" }, { status: 400 });
        }
        if (file.size === 0) return jsonResponse({ error: "Пустой файл" }, { status: 400 });
        if (file.size > MAX_BYTES) {
          return jsonResponse({ error: "Файл слишком большой (макс 20МБ)" }, { status: 400 });
        }

        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 8).replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${routePointId}/${kind}/offline-${clientUploadId}.${ext}`;

        // Зарегистрировать попытку (pending) — если ещё нет записи.
        if (!existing) {
          const { error: insErr } = await supabaseAdmin.from("route_point_photo_uploads").insert({
            client_upload_id: clientUploadId,
            route_point_id: routePointId,
            order_id: orderId,
            kind,
            status: "pending",
            actor,
            device_created_at: deviceCreatedAt,
          });
          if (insErr && !/duplicate key/i.test(insErr.message)) {
            return jsonResponse({ error: insErr.message }, { status: 500 });
          }
        }

        // Загрузка в bucket (upsert=true для повторных попыток после сетевых сбоев).
        const { error: upErr } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(path, file, {
            upsert: true,
            contentType: file.type || "image/jpeg",
          });
        if (upErr) {
          await supabaseAdmin
            .from("route_point_photo_uploads")
            .update({ status: "failed", error: upErr.message })
            .eq("client_upload_id", clientUploadId);
          return jsonResponse({ error: upErr.message }, { status: 500 });
        }

        const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        const fileUrl = pub.publicUrl;

        // Запись в основную таблицу route_point_photos. Дубль допускаем — проверим по storage_path.
        const { data: existingPhoto } = await supabaseAdmin
          .from("route_point_photos")
          .select("id")
          .eq("storage_path", path)
          .maybeSingle();
        if (!existingPhoto) {
          const { error: insPhotoErr } = await supabaseAdmin.from("route_point_photos").insert({
            route_point_id: routePointId,
            order_id: orderId,
            kind: kind as never,
            file_url: fileUrl,
            storage_path: path,
            uploaded_by: userData.user.id,
          });
          if (insPhotoErr) {
            await supabaseAdmin
              .from("route_point_photo_uploads")
              .update({ status: "failed", error: insPhotoErr.message, file_url: fileUrl, storage_path: path })
              .eq("client_upload_id", clientUploadId);
            return jsonResponse({ error: insPhotoErr.message }, { status: 500 });
          }
        }

        await supabaseAdmin
          .from("route_point_photo_uploads")
          .update({ status: "uploaded", file_url: fileUrl, storage_path: path, error: null })
          .eq("client_upload_id", clientUploadId);

        return jsonResponse({ ok: true, file_url: fileUrl, storage_path: path });
      },
    },
  },
});
