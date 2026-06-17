// Редактор размещения печати/подписи на странице PDF (упрощённый).
// PDF не рендерим в браузере — показываем «лист» в пропорциях страницы и
// две draggable рамки. Координаты в PDF-points (1pt = 1/72").
import { useEffect, useRef, useState } from "react";
import type { Placement } from "@/lib/signatures/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Props {
  placement: Placement;
  pageCount: number;
  pageSize: { w: number; h: number };
  onChange: (p: Placement) => void;
}

export function SignaturePlacementEditor({ placement, pageCount, pageSize, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = useState(480);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWrapW(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = wrapW / pageSize.w;
  const pageH = Math.round(pageSize.h * scale);

  const onDragStart = (
    e: React.PointerEvent<HTMLDivElement>,
    kind: "stamp" | "signature",
  ) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = kind === "stamp" ? placement.stamp : placement.signature;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const nx = clamp(orig.x + dx, 0, pageSize.w - orig.w);
      const ny = clamp(orig.y + dy, 0, pageSize.h - orig.w);
      const next: Placement = { ...placement, [kind]: { ...orig, x: nx, y: ny } } as Placement;
      onChange(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const setVal = (k: "stamp" | "signature", field: "x" | "y" | "w", v: number) => {
    const cur = k === "stamp" ? placement.stamp : placement.signature;
    const next = { ...cur, [field]: v };
    onChange({ ...placement, [k]: next } as Placement);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">Страница (1…{pageCount})</Label>
          <Input
            type="number" min={1} max={pageCount}
            value={placement.page}
            onChange={(e) =>
              onChange({
                ...placement,
                page: Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)),
              })
            }
            className="w-28"
          />
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => {
            // Сброс в нижний-правый угол
            const stampW = Math.min(160, pageSize.w * 0.25);
            const sigW = Math.min(160, pageSize.w * 0.25);
            const m = 36;
            onChange({
              page: placement.page,
              stamp: { x: pageSize.w - stampW - m, y: pageSize.h - stampW - m, w: stampW },
              signature: {
                x: pageSize.w - sigW - m - stampW - 8,
                y: pageSize.h - sigW * 0.5 - m,
                w: sigW,
              },
            });
          }}
        >
          В правый нижний угол
        </Button>
      </div>

      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded border bg-white"
        style={{ height: pageH || 600 }}
      >
        <DragBox
          color="rgba(34,197,94,0.7)"
          label="Печать"
          rect={placement.stamp}
          scale={scale}
          onPointerDown={(e) => onDragStart(e, "stamp")}
        />
        <DragBox
          color="rgba(59,130,246,0.7)"
          label="Подпись"
          rect={placement.signature}
          scale={scale}
          onPointerDown={(e) => onDragStart(e, "signature")}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CoordsBlock title="Печать" v={placement.stamp} onChange={(f, v) => setVal("stamp", f, v)} />
        <CoordsBlock title="Подпись" v={placement.signature} onChange={(f, v) => setVal("signature", f, v)} />
      </div>
    </div>
  );
}

function DragBox(props: {
  color: string;
  label: string;
  rect: { x: number; y: number; w: number };
  scale: number;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const { color, label, rect, scale, onPointerDown } = props;
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute cursor-move border-2 text-[10px] font-medium"
      style={{
        left: rect.x * scale,
        top: rect.y * scale,
        width: rect.w * scale,
        height: rect.w * scale * 0.6,
        borderColor: color,
        background: "rgba(255,255,255,0.4)",
        color,
      }}
    >
      <div className="px-1">{label}</div>
    </div>
  );
}

function CoordsBlock(props: {
  title: string;
  v: { x: number; y: number; w: number };
  onChange: (f: "x" | "y" | "w", v: number) => void;
}) {
  return (
    <div className="rounded border p-2">
      <div className="mb-1 text-xs font-medium">{props.title}</div>
      <div className="grid grid-cols-3 gap-2">
        {(["x", "y", "w"] as const).map((f) => (
          <div key={f}>
            <Label className="text-[10px] uppercase">{f}</Label>
            <Input
              type="number"
              value={Math.round(props.v[f])}
              onChange={(e) => props.onChange(f, Number(e.target.value) || 0)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
