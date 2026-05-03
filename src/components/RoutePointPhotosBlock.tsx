import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiGetAuth } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  ROUTE_POINT_PHOTO_KIND_LABELS,
  ROUTE_POINT_PHOTO_KIND_ORDER,
  ROUTE_POINT_PHOTOS_BUCKET,
  type RoutePointPhotoKind,
} from "@/lib/routePointPhotos";
import { useSetting } from "@/lib/settings-provider";

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

  const list = photos ?? [];
  const hasQr = list.some((p) => p.kind === "qr");
  const hasProblem = list.some((p) => p.kind === "problem");

  const isFailed = pointStatus === "not_delivered" || pointStatus === "returned_to_warehouse";
  const qrMissing = requiresQr && !hasQr;
  const problemMissing = isFailed && !hasProblem;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Фото и документы</span>
          <span className="text-xs text-muted-foreground">({list.length})</span>
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
        {ROUTE_POINT_PHOTO_KIND_ORDER.map((kind) => (
          <PhotoKindRow
            key={kind}
            kind={kind}
            required={
              (kind === "qr" && requiresQr) ||
              (kind === "problem" && isFailed)
            }
            photos={list.filter((p) => p.kind === kind)}
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
  routePointId,
  orderId,
  onChange,
}: {
  kind: RoutePointPhotoKind;
  required: boolean;
  photos: Photo[];
  routePointId: string;
  orderId: string | null;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${routePointId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(ROUTE_POINT_PHOTOS_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(ROUTE_POINT_PHOTOS_BUCKET).getPublicUrl(path);
        const { error: insErr } = await (
          supabase.from("route_point_photos") as unknown as {
            insert: (p: Record<string, unknown>) => Promise<{ error: Error | null }>;
          }
        ).insert({
          route_point_id: routePointId,
          order_id: orderId,
          kind,
          file_url: pub.publicUrl,
          storage_path: path,
        });
        if (insErr) throw insErr;
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      toast.success("Фото загружено");
      onChange();
    },
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

      {photos.length === 0 ? (
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
        </div>
      )}
    </div>
  );
}
