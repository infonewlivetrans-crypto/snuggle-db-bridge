import { useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { uploadPublicFile } from "@/lib/uploads";

interface PhotoUploadProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  bucket?: string;
  prefix?: string;
}

export function PhotoUpload({
  label,
  value,
  onChange,
  bucket = "vehicle-photos",
  prefix = "",
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handle = async (file: File | undefined) => {
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
      const url = await uploadPublicFile(bucket, file, prefix);
      onChange(url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-border">
          <img
            src={value}
            alt={label}
            loading="lazy"
            className="h-32 w-full object-cover"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/90 text-destructive shadow hover:bg-background"
            aria-label="Удалить фото"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-secondary/30 text-xs text-muted-foreground hover:bg-secondary/60">
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Загрузка…</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5" />
              <span>Загрузить фото</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => handle(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}
