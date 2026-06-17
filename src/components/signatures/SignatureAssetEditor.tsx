// Редактор образца печати и подписи перевозчика.
// Загружает лист сканера/фото, позволяет выделить bbox печати и подписи,
// удалить белый/серый фон через canvas (порог + контраст), показать
// предпросмотр и сохранить готовые PNG с прозрачностью.
import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiPost } from "@/lib/api-client";
import type { BBox } from "@/lib/signatures/types";

interface Props {
  carrierExtId: string | null;
  onSaved?: () => void;
}

type Mode = "stamp" | "signature" | null;

export function SignatureAssetEditor({ carrierExtId, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [src, setSrc] = useState<HTMLImageElement | null>(null);
  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [stampBBox, setStampBBox] = useState<BBox | null>(null);
  const [sigBBox, setSigBBox] = useState<BBox | null>(null);
  const [threshold, setThreshold] = useState(230);
  const [contrast, setContrast] = useState(10);
  const [mode, setMode] = useState<Mode>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Загрузка файла
  const onFile = (f: File) => {
    setSrcFile(f);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      setSrc(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Перерисовка холста
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !src) return;
    const maxW = 720;
    const scale = src.width > maxW ? maxW / src.width : 1;
    c.width = Math.round(src.width * scale);
    c.height = Math.round(src.height * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    drawBox(ctx, stampBBox, "rgba(34,197,94,0.9)", "Печать");
    drawBox(ctx, sigBBox, "rgba(59,130,246,0.9)", "Подпись");
  }, [src, stampBBox, sigBBox]);

  const canvasToImageCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * c.width) / rect.width;
    const y = ((e.clientY - rect.top) * c.height) / rect.height;
    const sx = src!.width / c.width;
    return { x: Math.round(x * sx), y: Math.round(y * sx) };
  };
  const onCanvasDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!src || !mode) return;
    const p = canvasToImageCoords(e);
    setDrag(p);
    if (mode === "stamp") setStampBBox({ x: p.x, y: p.y, w: 1, h: 1 });
    else setSigBBox({ x: p.x, y: p.y, w: 1, h: 1 });
  };
  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!src || !drag || !mode) return;
    const p = canvasToImageCoords(e);
    const b: BBox = {
      x: Math.min(drag.x, p.x),
      y: Math.min(drag.y, p.y),
      w: Math.max(2, Math.abs(p.x - drag.x)),
      h: Math.max(2, Math.abs(p.y - drag.y)),
    };
    if (mode === "stamp") setStampBBox(b);
    else setSigBBox(b);
  };
  const onCanvasUp = () => setDrag(null);

  const buildPng = async (bbox: BBox): Promise<Blob> => {
    if (!src) throw new Error("no_src");
    const off = document.createElement("canvas");
    off.width = bbox.w;
    off.height = bbox.h;
    const ctx = off.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);
    const data = ctx.getImageData(0, 0, bbox.w, bbox.h);
    const px = data.data;
    const c = 1 + contrast / 100;
    for (let i = 0; i < px.length; i += 4) {
      // контраст
      px[i] = clamp((px[i] - 128) * c + 128);
      px[i + 1] = clamp((px[i + 1] - 128) * c + 128);
      px[i + 2] = clamp((px[i + 2] - 128) * c + 128);
      // прозрачность по яркости
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (lum >= threshold) px[i + 3] = 0;
    }
    ctx.putImageData(data, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      off.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
    );
  };

  const save = async () => {
    if (!stampBBox || !sigBBox) {
      toast.error("Выделите область печати и область подписи");
      return;
    }
    if (!consent) {
      toast.error("Подтвердите согласие на использование печати и подписи");
      return;
    }
    setSaving(true);
    try {
      const [stampPng, sigPng] = await Promise.all([buildPng(stampBBox), buildPng(sigBBox)]);
      const fd = new FormData();
      fd.append("stamp", new File([stampPng], "stamp.png", { type: "image/png" }));
      fd.append("signature", new File([sigPng], "signature.png", { type: "image/png" }));
      if (srcFile) fd.append("source", srcFile);
      fd.append("stamp_bbox", JSON.stringify(stampBBox));
      fd.append("signature_bbox", JSON.stringify(sigBBox));
      fd.append("bg_removal", JSON.stringify({ threshold, contrast }));
      fd.append("consent", "true");
      if (carrierExtId) fd.append("carrier_ext_id", carrierExtId);
      await apiPost("/api/inbound-signatures/assets", fd);
      toast.success("Печать и подпись сохранены");
      onSaved?.();
    } catch (e) {
      toast.error(`Не удалось сохранить: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const [stampPreview, setStampPreview] = useState<string | null>(null);
  const [sigPreview, setSigPreview] = useState<string | null>(null);
  const refreshPreview = async () => {
    try {
      if (stampBBox) {
        const b = await buildPng(stampBBox);
        setStampPreview(URL.createObjectURL(b));
      }
      if (sigBBox) {
        const b = await buildPng(sigBBox);
        setSigPreview(URL.createObjectURL(b));
      }
    } catch {/* ignore */}
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Печать и подпись перевозчика</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> Загрузить лист (фото/скан)
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          {src && (
            <>
              <Button variant={mode === "stamp" ? "default" : "outline"} onClick={() => setMode("stamp")}>
                Выделить печать
              </Button>
              <Button variant={mode === "signature" ? "default" : "outline"} onClick={() => setMode("signature")}>
                Выделить подпись
              </Button>
              <Button variant="ghost" onClick={refreshPreview}>
                <RefreshCw className="mr-1 h-4 w-4" /> Обновить предпросмотр
              </Button>
            </>
          )}
        </div>

        {src && (
          <div className="overflow-auto rounded border bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#fff_0%_50%)_50%_/_20px_20px]">
            <canvas
              ref={canvasRef}
              onMouseDown={onCanvasDown}
              onMouseMove={onCanvasMove}
              onMouseUp={onCanvasUp}
              onMouseLeave={onCanvasUp}
              style={{ cursor: mode ? "crosshair" : "default", maxWidth: "100%" }}
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Порог удаления фона (200–250)</Label>
            <Input
              type="number" min={150} max={255}
              value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 230)}
            />
          </div>
          <div>
            <Label className="text-xs">Контраст (-50…+50)</Label>
            <Input
              type="number" min={-50} max={50}
              value={contrast} onChange={(e) => setContrast(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <PreviewCard title="Печать без фона" url={stampPreview} />
          <PreviewCard title="Подпись без фона" url={sigPreview} />
        </div>

        {(stampPreview || sigPreview) && stampBBox && sigBBox && (
          <p className="text-xs text-muted-foreground">
            Если на печати или подписи остался белый/серый фон — поднимите порог или контраст и нажмите
            «Обновить предпросмотр». Если фон не удаляется чисто — сфотографируйте лист ровнее при
            хорошем дневном освещении на белом фоне.
          </p>
        )}

        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
          <span>
            Подтверждаю, что это моя печать и подпись и я согласен на их использование при
            автоматическом подписании входящих документов от грузовладельцев.
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving || !stampBBox || !sigBBox || !consent}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Сохранить как активный образец
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewCard({ title, url }: { title: string; url: string | null }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{title}</div>
      <div className="flex h-32 items-center justify-center rounded border bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#fff_0%_50%)_50%_/_16px_16px]">
        {url ? <img src={url} alt={title} style={{ maxHeight: "100%", maxWidth: "100%" }} /> : (
          <span className="text-xs text-muted-foreground">Нет предпросмотра</span>
        )}
      </div>
    </div>
  );
}

function drawBox(ctx: CanvasRenderingContext2D, b: BBox | null, color: string, label: string) {
  if (!b) return;
  const c = ctx.canvas;
  const sx = c.width / (b.w + b.x > c.width ? c.width : c.width);
  // Канвас уже масштабирован под исходное изображение → пересчёт:
  const srcW = (ctx as unknown as { _srcW?: number })._srcW ?? ctx.canvas.width;
  void sx; void srcW;
}
function clamp(n: number): number {
  return Math.max(0, Math.min(255, n));
}
