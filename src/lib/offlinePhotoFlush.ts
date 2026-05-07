// Отправка офлайн-фото через POST /api/route-point-photos/offline-upload.
// Идемпотентность по client_upload_id.

import { authHeaders } from "@/lib/api-client";
import {
  listPendingPhotos,
  updatePhoto,
  deletePhoto,
  type OfflinePhotoRecord,
} from "@/lib/offlinePhotoStore";

let flushing = false;

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function uploadOne(rec: OfflinePhotoRecord): Promise<void> {
  const fd = new FormData();
  fd.append("client_upload_id", rec.client_upload_id);
  fd.append("route_point_id", rec.route_point_id);
  if (rec.order_id) fd.append("order_id", rec.order_id);
  fd.append("kind", rec.kind);
  if (rec.actor) fd.append("actor", rec.actor);
  fd.append("device_created_at", rec.device_created_at);
  fd.append(
    "file",
    new File([rec.blob], rec.file_name || "photo.jpg", {
      type: rec.mime_type || "image/jpeg",
    }),
  );

  const res = await fetch("/api/route-point-photos/offline-upload", {
    method: "POST",
    credentials: "same-origin",
    headers: { ...authHeaders() },
    body: fd,
  });
  const text = await res.text();
  let parsed: { ok?: boolean; file_url?: string; storage_path?: string; error?: string } = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok || parsed.error) {
    const msg = parsed.error || `HTTP ${res.status}`;
    const isNetwork = res.status === 0 || res.status >= 500;
    throw Object.assign(new Error(msg), { isNetwork });
  }
  await updatePhoto(rec.client_upload_id, {
    status: "uploaded",
    file_url: parsed.file_url ?? null,
    storage_path: parsed.storage_path ?? null,
    error: null,
  });
}

export async function flushPhotoQueue(): Promise<{ sent: number; failed: number }> {
  if (flushing || !isOnline()) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const items = await listPendingPhotos();
    for (const rec of items) {
      try {
        await updatePhoto(rec.client_upload_id, {
          status: "uploading",
          attempts: (rec.attempts ?? 0) + 1,
          last_attempt_at: Date.now(),
        });
        await uploadOne(rec);
        sent++;
        // Удалим запись через 5 секунд (чтобы UI успел показать "отправлено").
        setTimeout(() => {
          void deletePhoto(rec.client_upload_id).catch(() => {});
        }, 5000);
      } catch (e) {
        const err = e as Error & { isNetwork?: boolean };
        if (err.isNetwork || /failed to fetch|network|load failed|timeout/i.test(err.message)) {
          await updatePhoto(rec.client_upload_id, {
            status: "error",
            error: err.message,
          });
          // Сетевая ошибка — прерываем, попробуем позже.
          break;
        }
        await updatePhoto(rec.client_upload_id, {
          status: "error",
          error: err.message,
        });
        failed++;
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}

let installed = false;
export function installPhotoFlushAutoTriggers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const trigger = () => {
    void flushPhotoQueue();
  };
  window.addEventListener("online", trigger);
  window.addEventListener("focus", trigger);
  window.addEventListener("driver-offline-photos:changed", trigger);
  // Периодический ретрай для длительных простоев.
  setInterval(trigger, 60_000);
  // Первый запуск.
  if (isOnline()) setTimeout(trigger, 1000);
}
