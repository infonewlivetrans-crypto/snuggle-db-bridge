import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGetAuth, apiPost, apiDelete } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Trash2, AlertCircle, CloudOff, Loader2, CheckCircle2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import {
  ROUTE_POINT_PHOTO_KIND_LABELS,
  ROUTE_POINT_PHOTO_KIND_ORDER,
  ROUTE_POINT_PHOTOS_BUCKET,
  type RoutePointPhotoKind,
} from "@/lib/routePointPhotos";
import { useSetting } from "@/lib/settings-provider";
import {
  blobToObjectURL,
  deletePhoto as idbDeletePhoto,
  enforceOfflinePhotoQuota,
  listPhotosByRoutePoint,
  newClientUploadId,
  OFFLINE_PHOTO_MAX_FILE_BYTES,
  putPhoto,
  subscribePhotos,
  type OfflinePhotoRecord,
} from "@/lib/offlinePhotoStore";
import { compressImageFile } from "@/lib/imageCompress";
import {
  flushPhotoQueue,
  installPhotoFlushAutoTriggers,
} from "@/lib/offlinePhotoFlush";

type Photo = {
  id: string;
  route_point_id: string;
  order_id: string | null;
  kind: RoutePointPhotoKind;
  file_url: string;
  storage_path: string | null;
  created_at: string;
};

type Props = {
  routePointId: string;
  orderId: string | null;
  requiresQr: boolean;
  pointStatus: string;
};

export function RoutePointPhotosBlock({
  routePointId,
  orderId,
  requiresQr,
  pointStatus,
}: Props) {
  const qc = useQueryClient();

  useEffect(() => {
    installPhotoFlushAutoTriggers();
  }, []);

  const { data: photos } = useQuery({
    queryKey: ["route-point-photos", routePointId],
    queryFn: async (): Promise<Photo[]> => {
      const { rows } = await apiGetAuth<{ rows: Photo[] }>(
        `/api/delivery-photos?route_point_id=${encodeURIComponent(routePointId)}`,
      );
      return rows;
    },
    staleTime: 3 * 60_000,
  });

  // Локальные офлайн-фото из IndexedDB для этой точки.
  const [offlinePhotos, setOfflinePhotos] = useState<OfflinePhotoRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const list = await listPhotosByRoutePoint(routePointId).catch(() => []);
      if (!cancelled) setOfflinePhotos(list);
    };
    load();
    const unsub = subscribePhotos(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [routePointId]);

  // Когда что-то «uploaded» — обновим серверный список.
  useEffect(() => {
    if (offlinePhotos.some((p) => p.status === "uploaded")) {
      qc.invalidateQueries({ queryKey: ["route-point-photos", routePointId] });
    }
  }, [offlinePhotos, qc, routePointId]);

  const list = photos ?? [];
  const hasQr =
    list.some((p) => p.kind === "qr") ||
    offlinePhotos.some((p) => p.kind === "qr" && p.status !== "uploaded");
  const hasProblem =
    list.some((p) => p.kind === "problem") ||
    offlinePhotos.some((p) => p.kind === "problem" && p.status !== "uploaded");

  const docsRequired = useSetting<boolean>("driver_document_photos_enabled", false);

  const isFailed = pointStatus === "not_delivered" || pointStatus === "returned_to_warehouse";
  const qrMissing = requiresQr && !hasQr;
  const problemMissing = isFailed && !hasProblem;

  const visibleKinds = docsRequired
    ? ROUTE_POINT_PHOTO_KIND_ORDER
    : ROUTE_POINT_PHOTO_KIND_ORDER.filter((k) => k === "qr" || k === "problem");

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Фото и документы</span>
          <span className="text-xs text-muted-foreground">
            ({list.length}
            {offlinePhotos.length > 0 ? ` + ${offlinePhotos.length} локально` : ""})
          </span>
        </div>
      </div>

      {(qrMissing || problemMissing) && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="space-y-0.5">
            {qrMissing && <div>Требуется фото QR-кода — без него нельзя ставить «Доставлено».</div>}
            {problemMissing && <div>Требуется фото проблемы для статуса «Не доставлено» / «Возврат на склад».</div>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visibleKinds.map((kind) => (
          <PhotoKindRow
            key={kind}
            kind={kind}
            required={
              (kind === "qr" && requiresQr) ||
              (kind === "problem" && isFailed)
            }
            photos={list.filter((p) => p.kind === kind)}
            offlinePhotos={offlinePhotos.filter((p) => p.kind === kind)}
            routePointId={routePointId}
            orderId={orderId}
            onChange={() => {
              qc.invalidateQueries({ queryKey: ["route-point-photos", routePointId] });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PhotoKindRow({
  kind,
  required,
  photos,
  offlinePhotos,
  routePointId,
  orderId,
  onChange,
}: {
  kind: RoutePointPhotoKind;
  required: boolean;
  photos: Photo[];
  offlinePhotos: OfflinePhotoRecord[];
  routePointId: string;
  orderId: string | null;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = useMutation({
    mutationFn: async (rawFile: File) => {
      // Сжимаем большие изображения, чтобы уложиться в лимит на 1 файл.
      let file = rawFile;
      if (rawFile.type.startsWith("image/") && rawFile.size > OFFLINE_PHOTO_MAX_FILE_BYTES * 0.9) {
        try {
          const compressed = await compressImageFile(rawFile, {
            targetBytes: Math.floor(OFFLINE_PHOTO_MAX_FILE_BYTES * 0.9),
          });
          if (compressed.size < rawFile.size) {
            file = compressed;
            const before = Math.round(rawFile.size / 1024 / 102.4) / 10;
            const after = Math.round(compressed.size / 1024 / 102.4) / 10;
            toast.message("Фото сжато перед сохранением", {
              description: `${before} МБ → ${after} МБ`,
            });
          }
        } catch {
          /* ignore */
        }
      }
      if (file.size > OFFLINE_PHOTO_MAX_FILE_BYTES) {
        toast.error(
          `Файл слишком большой (макс. ${Math.round(OFFLINE_PHOTO_MAX_FILE_BYTES / 1024 / 1024)} МБ)`,
        );
        return;
      }
      // Если оффлайн или попытка не удалась — сохраняем в IndexedDB.
      const saveOffline = async (reason?: string) => {
        // Освобождаем место под новый файл, удаляя самые старые.
        const removed = await enforceOfflinePhotoQuota(file.size, 1).catch(() => 0);
        if (removed > 0) {
          toast.message("Очищены старые офлайн-фото", {
            description: `Удалено: ${removed}`,
          });
        }
        const rec: OfflinePhotoRecord = {
          client_upload_id: newClientUploadId(),
          route_point_id: routePointId,
          order_id: orderId,
          kind,
          actor: "Водитель",
          file_name: file.name || `${kind}.jpg`,
          mime_type: file.type || "image/jpeg",
          size: file.size,
          blob: file,
          device_created_at: new Date().toISOString(),
          status: "pending",
          attempts: 0,
        };
        await putPhoto(rec);
        if (reason) {
          toast.message("Фото сохранено на устройстве", {
            description: "Будет отправлено при появлении интернета.",
          });
        } else {
          toast.success("Сохранено на устройстве (офлайн)");
        }
        // Попробуем сразу отправить (если сеть появилась).
        void flushPhotoQueue();
      };

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        await saveOffline();
        return;
      }
      setUploading(true);
      try {
        const fd = new FormData();
        fd.set("bucket", ROUTE_POINT_PHOTOS_BUCKET);
        fd.set("file", file);
        let uploadResp: { path: string; public_url: string };
        try {
          uploadResp = await apiPost<{ path: string; public_url: string }>(
            "/api/storage/upload",
            fd,
            60000,
          );
        } catch (e) {
          await saveOffline(e instanceof Error ? e.message : String(e));
          return;
        }
        try {
          await apiPost("/api/route-point-photos", {
            route_point_id: routePointId,
            order_id: orderId,
            kind,
            file_url: uploadResp.public_url,
            storage_path: uploadResp.path,
          });
        } catch (e) {
          await saveOffline(e instanceof Error ? e.message : String(e));
          return;
        }
        toast.success("Фото загружено");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await saveOffline(msg);
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => onChange(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (photo: Photo) => {
      if (photo.storage_path) {
        await supabase.storage.from(ROUTE_POINT_PHOTOS_BUCKET).remove([photo.storage_path]);
      }
      const { error } = await supabase.from("route_point_photos").delete().eq("id", photo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Удалено");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {ROUTE_POINT_PHOTO_KIND_LABELS[kind]}
          {required && <span className="text-red-500">*</span>}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3 w-3" />
          {uploading ? "..." : "Загрузить"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
      </div>

      {photos.length === 0 && offlinePhotos.length === 0 ? (
        <div className="text-xs text-muted-foreground">Нет фото</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="group relative">
              <a href={p.file_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={p.file_url}
                  alt=""
                  className="h-16 w-16 rounded border border-border object-cover"
                />
              </a>
              <button
                type="button"
                aria-label="Удалить фото"
                onClick={() => remove.mutate(p)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white opacity-0 shadow group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {offlinePhotos.map((p) => (
            <OfflinePhotoTile key={p.client_upload_id} rec={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function OfflinePhotoTile({ rec }: { rec: OfflinePhotoRecord }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    const u = blobToObjectURL(rec.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [rec.blob]);

  const statusBadge = (() => {
    switch (rec.status) {
      case "uploading":
        return (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-blue-600/90 py-0.5 text-[10px] text-white">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Отправка
          </span>
        );
      case "uploaded":
        return (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-emerald-600/90 py-0.5 text-[10px] text-white">
            <CheckCircle2 className="h-2.5 w-2.5" /> Отправлено
          </span>
        );
      case "error":
        return (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-red-600/90 py-0.5 text-[10px] text-white">
            <RotateCw className="h-2.5 w-2.5" /> Повтор
          </span>
        );
      case "pending":
      default:
        return (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-amber-500/90 py-0.5 text-[10px] text-white">
            <CloudOff className="h-2.5 w-2.5" /> Офлайн
          </span>
        );
    }
  })();

  return (
    <div className="group relative">
      {url ? (
        <img
          src={url}
          alt=""
          className="h-16 w-16 rounded border border-amber-400 object-cover"
        />
      ) : (
        <div className="h-16 w-16 rounded border border-amber-400 bg-muted" />
      )}
      {statusBadge}
      {rec.status !== "uploading" && (
        <button
          type="button"
          aria-label="Удалить локальное фото"
          onClick={() => {
            void idbDeletePhoto(rec.client_upload_id);
          }}
          className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white opacity-0 shadow group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      {rec.status === "error" && rec.error && (
        <div
          className="absolute left-0 top-0 h-16 w-16 cursor-help rounded"
          title={rec.error}
        />
      )}
    </div>
  );
}
