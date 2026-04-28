import { useState } from "react";
import { Loader2, QrCode, Upload, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { uploadPublicFile } from "@/lib/uploads";
import { db } from "@/lib/db";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface QrCaptureProps {
  orderId: string;
  orderNumber: string;
  requiresQr: boolean;
  qrPhotoUrl: string | null;
  qrUploadedAt: string | null;
  /** compact = маленький виджет для списков точек маршрута */
  compact?: boolean;
}

export function QrCapture({
  orderId,
  orderNumber,
  requiresQr,
  qrPhotoUrl,
  qrUploadedAt,
  compact = false,
}: QrCaptureProps) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: async (url: string | null) => {
      const updates: Record<string, unknown> = {
        qr_photo_url: url,
        qr_received: !!url,
      };
      if (url) {
        updates.qr_photo_uploaded_at = new Date().toISOString();
      } else {
        updates.qr_photo_uploaded_at = null;
      }
      const { error } = await db.from("orders").update(updates).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: (_d, url) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["route-points"] });
      toast.success(url ? "QR-код прикреплён" : "QR-код удалён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Можно загружать только изображения");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файл больше 10 МБ");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPublicFile("qr-photos", file, orderId);
      await save.mutateAsync(url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (!requiresQr && !qrPhotoUrl) {
    return null;
  }

  // ── Compact (списки точек маршрута)
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {qrPhotoUrl ? (
          <>
            <a
              href={qrPhotoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-900 hover:bg-green-100"
              title={`QR загружен ${qrUploadedAt ? new Date(qrUploadedAt).toLocaleString("ru-RU") : ""}`}
            >
              <CheckCircle2 className="h-3 w-3" />
              QR
            </a>
            <label
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary/60"
              title="Заменить фото QR"
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              {uploading ? "…" : "Заменить"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={uploading}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
          </>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100">
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <QrCode className="h-3 w-3" />
            )}
            {uploading ? "…" : "Загрузить QR"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={uploading}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        )}
      </div>
    );
  }

  // ── Full (карточка заказа)
  return (
    <div
      className={`rounded-lg border p-4 ${
        qrPhotoUrl
          ? "border-green-200 bg-green-50/50"
          : requiresQr
            ? "border-amber-300 bg-amber-50/50"
            : "border-border"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <QrCode className="h-3.5 w-3.5" />
          QR-код заказа {orderNumber}
        </div>
        {requiresQr && !qrPhotoUrl && (
          <span className="rounded-md bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            Обязательно
          </span>
        )}
        {qrPhotoUrl && (
          <span className="inline-flex items-center gap-1 rounded-md bg-green-200 px-2 py-0.5 text-[11px] font-semibold text-green-900">
            <CheckCircle2 className="h-3 w-3" />
            Получен
          </span>
        )}
      </div>

      {qrPhotoUrl ? (
        <div className="space-y-2">
          <a href={qrPhotoUrl} target="_blank" rel="noreferrer" className="block">
            <img
              src={qrPhotoUrl}
              alt="QR-код"
              loading="lazy"
              className="h-40 w-full rounded-md border border-border object-contain bg-background"
            />
          </a>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {qrUploadedAt
                ? `Загружено ${new Date(qrUploadedAt).toLocaleString("ru-RU")}`
                : ""}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                  disabled={save.isPending}
                >
                  <X className="h-3 w-3" />
                  Удалить
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить QR-фото?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Прикреплённое изображение QR-кода будет откреплено от заказа{" "}
                    {orderNumber}. Это действие можно отменить, загрузив фото заново.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => save.mutate(null)}
                  >
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-background text-xs text-muted-foreground hover:bg-secondary/40">
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Загрузка…</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5" />
              <span>Сделать фото / выбрать изображение</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}
