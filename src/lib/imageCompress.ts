// Сжатие изображений в браузере перед сохранением в IndexedDB.
// Цели: уложиться в targetBytes без сильной потери качества.
// Стратегия: понижаем максимальную сторону и quality итеративно.

export type CompressOptions = {
  targetBytes?: number; // желаемый максимум размера, по умолчанию 25 МБ
  maxDimension?: number; // стартовая макс. сторона, по умолчанию 2560
  minDimension?: number; // нижний предел стороны, по умолчанию 1280
  mimeType?: string; // 'image/jpeg' | 'image/webp'
  initialQuality?: number; // 0..1, по умолчанию 0.85
  minQuality?: number; // 0..1, по умолчанию 0.55
};

const DEFAULTS: Required<CompressOptions> = {
  targetBytes: 25 * 1024 * 1024,
  maxDimension: 2560,
  minDimension: 1280,
  mimeType: "image/jpeg",
  initialQuality: 0.85,
  minQuality: 0.55,
};

function isImage(file: File | Blob): boolean {
  return typeof file.type === "string" && file.type.startsWith("image/");
}

async function loadBitmap(file: Blob): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    return {
      width: bmp.width,
      height: bmp.height,
      draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      close: () => bmp.close?.(),
    };
  }
  // Fallback через HTMLImageElement.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Не удалось загрузить изображение"));
      i.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob вернул null"))),
      type,
      quality,
    );
  });
}

/**
 * Сжимает изображение под targetBytes. Если файл уже укладывается — возвращает исходник.
 * Не выбрасывает ошибку при неудаче сжатия — возвращает оригинал.
 */
export async function compressImageFile(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const o = { ...DEFAULTS, ...opts };
  if (!isImage(file)) return file;
  if (file.size <= o.targetBytes) return file;
  if (typeof document === "undefined") return file;

  let bitmap: Awaited<ReturnType<typeof loadBitmap>> | null = null;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return file;
  }

  try {
    const ratio = bitmap.width / bitmap.height || 1;
    const dims: number[] = [];
    let d = Math.min(o.maxDimension, Math.max(bitmap.width, bitmap.height));
    while (d >= o.minDimension) {
      dims.push(d);
      d = Math.round(d * 0.8);
    }
    if (dims.length === 0) dims.push(o.minDimension);

    const qualities: number[] = [];
    for (let q = o.initialQuality; q >= o.minQuality - 1e-6; q -= 0.1) {
      qualities.push(Math.max(o.minQuality, Math.round(q * 100) / 100));
    }

    let best: Blob | null = null;

    for (const dim of dims) {
      const w = bitmap.width >= bitmap.height ? dim : Math.round(dim * ratio);
      const h = bitmap.height > bitmap.width ? dim : Math.round(dim / ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage as unknown; // type guard noop
      bitmap.draw(ctx, w, h);

      for (const q of qualities) {
        try {
          const blob = await canvasToBlob(canvas, o.mimeType, q);
          if (!best || blob.size < best.size) best = blob;
          if (blob.size <= o.targetBytes) {
            const name = renameExt(file.name, o.mimeType);
            return new File([blob], name, { type: o.mimeType, lastModified: Date.now() });
          }
        } catch {
          /* try next */
        }
      }
    }

    if (best && best.size < file.size) {
      const name = renameExt(file.name, o.mimeType);
      return new File([best], name, { type: o.mimeType, lastModified: Date.now() });
    }
    return file;
  } finally {
    bitmap?.close();
  }
}

function renameExt(name: string, mime: string): string {
  const ext = mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg";
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.${ext}`;
}
